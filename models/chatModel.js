const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    members: Array,

    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
