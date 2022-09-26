const Joi = require('joi');
const { User, Sale, SalesProduct, sequelize } = require('../database/models');
const ConflictError = require('../utils/errors/ConflictError');
const UnauthorizedError = require('../utils/errors/UnauthorizedError');
const { generateEncryptedPassword } = require('../utils/generateEncryptedPassword');
const joiValidator = require('../utils/joiValidator');
const tokenService = require('./tokenService');

const UNAUTHORIZED_MSG = 'Current user does not have the permissions to perform this request';
const ALREADY_REGISTERED_MSG = 'User already registered';

module.exports = {
  validate: {
    body: joiValidator(
      Joi.object({
        name: Joi.string().min(12).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        role: Joi.string().optional(),
      }),
    ),
    credentials(authorization) {
      const { role } = tokenService.validate(authorization);

      if (role !== 'admin') {
        throw UnauthorizedError(UNAUTHORIZED_MSG);
      }
    },
  },
  async exists(email) {
    const user = await User.findOne({ where: { email } });
    if (user) throw new ConflictError(ALREADY_REGISTERED_MSG);
  },
  async create(authorization, data) {
    this.validate.credentials(authorization);
    await this.exists(data.email);

    const newUser = await User.create({
      ...data,
      role: 'customer',
      password: generateEncryptedPassword(data.password),
    });

    return {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
    };
  },
  async list(authorization) {
    this.validate.credentials(authorization);

    const users = await User.findAll({ attributes: { exclude: ['password'] } });
    return users;
  },
  async delete(authorization, userId) {
    this.validate.credentials(authorization);

    const { sales } = await Sale.findAll({ where: { userId } });

    sequelize.transaction(async (transaction) => {
      const deleteLinks = sales.map(({ id: saleId }) =>
        SalesProduct.destroy({ where: { saleId } }, { transaction }));
      await Promise.all(deleteLinks);

      const deleteSales = sales.map(({ id }) => Sale.destroy({ where: { id } }, { transaction }));
      await Promise.all(deleteSales);
    });
  },
};
