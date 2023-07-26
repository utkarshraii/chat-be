const MessageModel = require('../models/messageModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');

// Creating messages

const createMessage = catchAsync(async (req, res, next) => {
  const { chatId, senderId, text } = req.body;

  const message = await MessageModel.create({
    chatId,
    senderId,
    text,
  });

  res.status(200).send(message);
});

// Get Messages

const getMessages = catchAsync(async (req, res, next) => {
  const { chatId } = req.params;

  const messages = await MessageModel.find({ chatId });
  res.status(200).send(messages);
});

module.exports = { createMessage, getMessages };
