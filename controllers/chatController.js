const Chat = require('../models/chatModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');

// Creat chat
exports.createChat = catchAsync(async (req, res) => {
  const { firstId, secondId } = req.body;

  const chat = await Chat.findOne({
    members: { $all: [firstId, secondId] },
  });

  if (chat) return res.status(201).json(chat);

  const newChat = await Chat.create({
    members: [firstId, secondId],
  });

  res.status(200).json({ chat: newChat });
});

// find user chats
exports.findUserChats = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const chats = await Chat.find({
    members: { $in: [userId] },
  });

  res.status(200).json(chats);
});

// find chat
exports.findChat = catchAsync(async (req, res, next) => {
  const { firstId, secondId } = req.params;

  const chat = await Chat.findOne({
    members: { $all: [firstId, secondId] },
  });

  if (!chat) return next(new AppError('Chat does not exist', 401));

  res.status(200).json(chat);
});
