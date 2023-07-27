const express = require('express');
const userController = require('./../controllers/userController');
const authController = require('./../controllers/authController');
const multer = require('multer');

const router = express.Router();

// const upload = multer({ storage: multer.memoryStorage() });

router.post('/signup', authController.signup);
// router.post('/signup', authController.register, authController.sendOTP);
router.post('/sendOTP', authController.sendOTP);
router.post('/verifyOTP', authController.verifyOTP);
router.post('/login', authController.login);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);

router.get('/find/:userId', userController.findUser);
router.get('/find', userController.getUsers);

router.use(authController.protect);

router.post('/generate-zego-token', userController.generateZegoToken);

// router.patch('/update-me', upload.single('photo'), userController.updateMe);
router.patch(
  '/update-me',
  userController.uploadUserPhoto,
  userController.resizeUserPhoto,
  userController.updateMe
);
router.get('/getAll', userController.getUsers2);
router.get('/get-me', userController.getMe);
router.get('/get-all-verified-users', userController.getAllVerifiedUsers);

router.get('/getRequests', userController.getRequests);
router.get('/getFriends', userController.getFriends);
router.get('/getGroups', userController.getGroups);
router.get('/getUserOwnGroups', userController.getUserOwnGroups);
router.get('/getUserGroups', userController.getUserGroups);

router.post('/start-audio-call', userController.startAudioCall);
router.post('/start-video-call', userController.startVideoCall);

module.exports = router;
