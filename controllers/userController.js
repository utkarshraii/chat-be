const User = require('../models/userModel');
const FriendRequest = require('../models/friendRequestModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const filterObject = require('../utils/filterObject');

exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Create error if user POSTs password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updateMyPassword.',
        400
      )
    );
  }

  // 2) Filtered out unwanted fields names that are not allowed to be updated
  const filteredBody = filterObject(req.body, 'name', 'email', 'bio', 'photo');
  if (req.file) filteredBody.photo = req.file.filename;

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

exports.getUsers2 = async (req, res, next) => {
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
};

exports.getRequests = async (req, res, next) => {
  const requests = await FriendRequest.find({ recipient: req.user._id })
    .populate('sender')
    .select('_id name photo');

  res.status(200).json({
    status: 'success',
    data: requests,
    message: 'Requests found successfully!',
  });
};

exports.getFriends = async (req, res, next) => {
  const user = await User.findById(req.user._id).populate(
    'friends',
    '_id name photo'
  );
  res.status(200).json({
    status: 'success',
    data: user.friends,
    message: 'Friends found successfully!',
  });
};
