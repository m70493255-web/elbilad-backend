const EventEmitter = require("events");

class OrderEventEmitter extends EventEmitter {}

const orderEvents = new OrderEventEmitter();
orderEvents.setMaxListeners(200);

module.exports = orderEvents;
