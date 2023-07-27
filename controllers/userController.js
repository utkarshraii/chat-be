const fs = require('fs');
const User = require('../models/userModel');
const multer = require('multer');
const FriendRequest = require('../models/friendRequestModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const filterObject = require('../utils/filterObject');
const cloudinary = require('../utils/cloudinary');
const sharp = require('sharp');

const { generateToken04 } = require('./zegoServerAssistant');
const Room = require('../models/roomModel');
const VideoCall = require('../models/videoCall');
const AudioCall = require('../models/audioCall');

const appID = process.env.ZEGO_APP_ID; // type: number

const serverSecret = process.env.ZEGO_SERVER_SECRET; // type: 32 byte length string

exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: req.user,
  });
});

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
});

exports.uploadUserPhoto = upload.single('photo');

exports.resizeUserPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload an image file 2', 400));
  }

  // if (!req.file) return next();

  req.file.filename = `user-${req.user.id}-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(500, 500)
    .toFormat('jpeg')
    .jpeg({ quality: 90 })
    .toFile(`public/img/${req.file.filename}`);

  next();
});

exports.updateMe = catchAsync(async (req, res, next) => {
  / / / console.log(req.use._id);
  // const about = req.body.about;
  if (!req.file) {
    return next(new AppError('Please upload an image file', 400));
  }

  const name = req.body.name;

  const fileName = `${name}-${Date.now()}`;

  const result = await cloudinary.uploader.upload(
    `public/img/${req.file.filename}`,
    {
      folder: `my-folder/${fileName}`,
    }
  );

  // 2) Filtered out unwanted fields names that are not allowed to be updated
  const filteredBody = filterObject(
    req.body,
    'name',
    'email',
    'about',
    'photo'
  );

  filteredBody.photo = result.secure_url;

  fs.unlink(`public/img/${req.file.filename}`, (err) => {
    if (err) console.error(err);
    console.log(`Temporary file ${req.file.filename} deleted`);
  });

  // 3) Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

exports.findUser = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId);

  if (!user) return next(new AppError('user does not exist', 401));

  res.status(200).json(user);
});

exports.getUsers = catchAsync(async (req, res, next) => {
  const users = await User.find();

  if (!users) return next(new AppError('No exiting users in DB', 401));

  res.status(200).json(users);
});

exports.getUsers2 = catchAsync(async (req, res, next) => {
  const all_users = await User.find({
    verified: true,
  }).select('name _id photo');

  // const all_requests = await FriendRequest.find({
  //   $or: [{ sender: req.user._id }, { recipient: req.user._id }],
  // });

  const this_user = req.user;

  const remaining_users = all_users.filter(
    (user) =>
      !this_user.friends.includes(user._id) &&
      user._id.toString() !== req.user._id.toString()
  );

  res.status(200).json({
    status: 'success',
    data: remaining_users,
    message: 'Users found successfully!',
  });
});

exports.getAllVerifiedUsers = catchAsync(async (req, res, next) => {
  const all_users = await User.find({
    verified: true,
  }).select('name _id');

  const remaining_users = all_users.filter(
    (user) => user._id.toString() !== req.user._id.toString()
  );

  res.status(200).json({
    status: 'success',
    data: remaining_users,
    message: 'Users found successfully!',
  });
});

exports.getRequests = catchAsync(async (req, res, next) => {
  const requests = await FriendRequest.find({ recipient: req.user._id })
    .populate('sender')
    .select('_id name photo');

  res.status(200).json({
    status: 'success',
    data: requests,
    message: 'Requests found successfully!',
  });
});

exports.getFriends = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).populate(
    'friends',
    '_id name photo'
  );
  res.status(200).json({
    status: 'success',
    data: user.friends,
    message: 'Friends found successfully!',
  });
});

exports.getUserGroups = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id).populate('groups', 'name');
  res.status(200).json({
    status: 'success',
    data: user.groups,
    message: 'Users Groups found successfully!',
  });
});

exports.getGroups = catchAsync(async (req, res, next) => {
  const all_groups = await Room.find();

  if (!all_groups) return next(new AppError('No exiting groups in DB', 401));

  const this_user = req.user;

  const remaining_groups = all_groups.filter(
    (group) =>
      !this_user.groups.includes(group._id) &&
      group._id.toString() !== req.user._id.toString()
  );

  res.status(200).json({
    status: 'success',
    data: remaining_groups,
    message: 'Groups found successfully!',
  });
});

exports.getUserOwnGroups = catchAsync(async (req, res, next) => {
  // const userGroups = await Room.find(req.user._id);

  const groups = await Room.find();

  const userGroups = await groups.filter(
    (group) => group.owner == req.user._id
  );

  if (!userGroups)
    return next(new AppError('User has no exiting groups in DB', 401));

  res.status(200).json({
    status: 'success',
    data: userGroups,
    message: 'Users own Groups found successfully!',
  });
});

/**
 * Authorization authentication token generation
 */

exports.generateZegoToken = catchAsync(async (req, res, next) => {
  const { userId, room_id } = req.body;

  const effectiveTimeInSeconds = 3600; //type: number; unit: s; token expiration time, unit: second
  const payloadObject = {
    room_id, // Please modify to the user's roomID
    // The token generated allows loginRoom (login room) action
    // The token generated in this example allows publishStream (push stream) action
    privilege: {
      1: 1, // loginRoom: 1 pass , 0 not pass
      2: 1, // publishStream: 1 pass , 0 not pass
    },
    stream_id_list: null,
  }; //
  const payload = JSON.stringify(payloadObject);
  // Build token
  const token = generateToken04(
    appID * 1,
    userId,
    serverSecret,
    effectiveTimeInSeconds,
    payload
  );

  res.status(200).json({
    status: 'success',
    message: 'Token generated successfully',
    token,
  });
});

exports.startAudioCall = catchAsync(async (req, res, next) => {
  const from = req.user._id;
  const to = req.body.id;

  const from_user = await User.findById(from);
  const to_user = await User.findById(to);

  // create a new call audioCall Doc and send required data to client
  const new_audio_call = await AudioCall.create({
    participants: [from, to],
    from,
    to,
    status: 'Ongoing',
  });

  res.status(200).json({
    data: {
      from: to_user,
      roomID: new_audio_call._id,
      streamID: to,
      userID: from,
      userName: from,
    },
  });
});

exports.startVideoCall = catchAsync(async (req, res, next) => {
  const from = req.user._id;
  const to = req.body.id;

  const from_user = await User.findById(from);
  const to_user = await User.findById(to);

  // create a new call videoCall Doc and send required data to client
  const new_video_call = await VideoCall.create({
    participants: [from, to],
    from,
    to,
    status: 'Ongoing',
  });

  res.status(200).json({
    data: {
      from: to_user,
      roomID: new_video_call._id,
      streamID: to,
      userID: from,
      userName: from,
    },
  });
});
