const crypto = require('crypto');
// const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const Email = require('./../utils/email');
const filterObject = require('../utils/filterObject');
const otpGenerator = require('otp-generator');

const mailService = require('../services/mailer');

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);

  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });

  // if (process.env.NODE_ENV === 'production') cookieOptions.secure = true;

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });

  const url = `${req.protocol}://${req.get('host')}/me`;
  console.log(url);

  await new Email(newUser, url).sendWelcome();

  createSendToken(newUser, 201, req, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password!', 400));
  }
  // 2) Check if user exists && password is correct
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) If everything ok, send token to client
  createSendToken(user, 200, req, res);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check of it's there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in! Please log in to get access.', 401)
    );
  }

  // 2) Verification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(
      new AppError(
        'The user belonging to this token does no longer exist.',
        401
      )
    );
  }

  // 4) Check if user changed password after the token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password! Please log in again.', 401)
    );
  }

  // GRANT ACCESS TO PROTECTED ROUTE
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

// Only for rendered pages, no errors!
exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      // 1) verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next();
      }

      // 3) Check if user changed password after the token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      // THERE IS A LOGGED IN USER
      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError('There is no user with email address.', 404));
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/users/resetPassword/${resetToken}`;

    const resetURL2 = `${req.protocol}://localhost:3000/auth/new-password/${resetToken}`;

    await new Email(user, resetURL2).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!'),
      500
    );
  }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    console.log('invalid');
    return next(new AppError('Token is invalid or has expired', 400));
  }
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // 3) Update changedPasswordAt property for the user... did it in userModel

  // 4) Log the user in, send JWT
  createSendToken(user, 200, req, res);
});

// ============================ More Advanced SignUp ==========================
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password } = req.body;

  const filteredBody = filterObject(req.body, 'name', 'email', 'password');

  // check if verified user with the email is already registered
  const userExist = await User.findOne({ email: email });

  if (userExist && userExist.verified) {
    return next(new AppError('Email already registered, try logging in', 400));
  } else if (userExist) {
    await User.findOneAndUpdate({ email: email }, filteredBody, {
      new: true,
      validateModifiedOnly: true,
    });

    // Generate OTP and send email to user
    req.userId = userExist._id;
    next();
  } else {
    const newUser = await User.create(filteredBody);

    // Generate OTP and send email to user
    req.userId = newUser._id;

    next();
  }
});

exports.sendOTP = catchAsync(async (req, res, next) => {
  const { userId } = req;

  const newOtp = otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });

  const otpExpiresTime = Date.now() + 10 * 60 * 1000;

  const user = await User.findByIdAndUpdate(userId, {
    otpExpiresTime,
  });

  user.otp = newOtp.toString();

  await user.save({ validateBeforeSave: true });

  // Sending The OTP to users email address
  const url = `${req.protocol}://${req.get('host')}/otp`;
  console.log(url);

  await new Email(user, url, newOtp).sendOTPVerify();

  // mailService.sendMail({
  //   from: 'lukechidubem@gmail.com',
  //   to: user.email,
  //   subject: 'OTP for CALChat',
  //   text: `Your OTP is ${newOtp}, it is only valid for 10 minutes`,
  //   attachment: [],
  // });

  res
    .status(200)
    .json({ status: 'success', otp: newOtp, message: 'OTP sent successfully' });
});

// OTP Verification
exports.verifyOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  const user = await User.findOne({
    email,
    otpExpiresTime: { $gt: Date.now() },
  });

  console.log(user);
  console.log(otp);

  // console.log(user.otp);

  if (!user) {
    return next(new AppError('Invalid Email or Experired OTP', 401));
  }

  if (user.verified) {
    return next(new AppError('Email is already verified', 401));
  }

  if (!(await user.correctOTP(otp, user.otp))) {
    return next(new AppError('Incorrect OTP', 401));
  }

  // if (user.otp != otp) {
  //   return next(new AppError('Incorrect OTP', 401));
  // }

  // Correct OTP
  user.verified = true;
  user.otp = undefined;

  await user.save({
    new: true,
    validateModifiedOnly: true,
  });

  // Send welcome email to User
  const url = `${req.protocol}://${req.get('host')}/me`;
  console.log(url);

  await new Email(user, url).sendWelcome();

  createSendToken(user, 200, req, res);
});
