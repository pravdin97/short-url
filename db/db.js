const Sequelize = require('sequelize')

const sequelize = new Sequelize(process.env.DBNAME, 
    process.env.DBUSER, process.env.DBPASS, {
        host: 'localhost',
        dialect: 'postgres'
})

// ============= MODELS =============

const Model = Sequelize.Model
class Link extends Model {}
Link.init({
    id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    long: {
        type: Sequelize.STRING,
        allowNull: false
    },
    short: {
        type: Sequelize.STRING,
        allowNull: false
    },
    owner: {
        type: Sequelize.STRING,
        allowNull: false
    }
}, {
    sequelize,
    tableName: 'links'
})

class Visit extends Model {}
Visit.init({
    id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        autoIncrement: true,
        primaryKey: true
    },
    link_id: {
        type: Sequelize.INTEGER,
     
        references: {
          // This is a reference to another model
          model: Link,
     
          // This is the column name of the referenced model
          key: 'id',
     
          // This declares when to check the foreign key constraint. PostgreSQL only.
          deferrable: Sequelize.Deferrable.INITIALLY_IMMEDIATE
        }
      },
}, {
    sequelize,
    tableName: 'visits'
})

sequelize
  .authenticate()
  .then(() => {
    console.log('Connection has been established successfully.');
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

sequelize.sync()

module.exports = {
    Link,
    Visit,
    sequelize,
    op: Sequelize.Op
}