const EventEmitter = require("events");

class OrderEventEmitter extends EventEmitter {}
const orderEvents = new OrderEventEmitter();
orderEvents.setMaxListeners(2000);

module.exports = orderEvents;
