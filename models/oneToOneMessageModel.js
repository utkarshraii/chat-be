const mongoose = require('mongoose');

const oneToOneMessageSchema = new mongoose.Schema({
  participants: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],

  messages: [
    {
      to: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
      },

      from: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
      },

      type: {
        type: String,
        enum: ['Text', 'Media', 'Document', 'Link'],
      },

      created_at: {
        type: Date,
        default: Date.now(),
      },

      text: {
        type: String,
      },

      file: {
        type: String,
      },
    },
  ],

  unreadCount: {
    type: Number,
    default: 0,
  },

  readBy: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],
});

const OneToOneMessage = mongoose.model(
  'OneToOneMessage',
  oneToOneMessageSchema
);
module.exports = OneToOneMessage;
