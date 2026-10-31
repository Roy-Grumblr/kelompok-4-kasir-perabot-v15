'use strict';

module.exports = function registerRoutes(R) {
  require('./public.routes')(R);
  require('./me.routes')(R);
  require('./products.routes')(R);
  require('./sales.routes')(R);
  require('./orders.routes')(R);
  require('./reviews.routes')(R);
  require('./restock.routes')(R);
  require('./settings.routes')(R);
  require('./users.routes')(R);
  require('./backup.routes')(R);
};
