// src/database/index.js
import { Sequelize } from 'sequelize';

const sequelize = new Sequelize('database_name', 'username', 'password', {
  host: 'localhost', // Replace with your database host
  dialect: 'mysql',
});

export default sequelize;
