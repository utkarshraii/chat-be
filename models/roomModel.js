const mongoose = require('mongoose');

// Define the schema for chat rooms
const roomSchema = new mongoose.Schema(
  {
    name: String,
    members: [String],
    members_id: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
      },
    ],

    owner: String,

    messages: [
      {
        to: {
          type: mongoose.Schema.ObjectId,
          ref: 'Room',
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

        sender: {
          type: String,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
