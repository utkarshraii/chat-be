/* eslint-disable no-console */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});

dotenv.config({ path: './config.env' });
const app = require('./app');

const http = require('http');
const server = http.createServer(app);

const { Server } = require('socket.io');
const { promisify } = require('util');
const User = require('./models/userModel');
const FriendRequest = require('./models/friendRequestModel');
const OneToOneMessage = require('./models/oneToOneMessageModel');
const AudioCall = require('./models/audioCall');
const Room = require('./models/roomModel');
const VideoCall = require('./models/videoCall');

// Create an io server and allow for CORS from http://localhost:3000 with GET and POST methods
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const DB = process.env.DATABASE.replace(
  '<PASSWORD>',
  process.env.DATABASE_PASSWORD
);

mongoose
  .connect(DB, {
    useNewUrlParser: true,
    // useCreateIndex: true,
    // useFindAndModify: false,
  })
  .then(() => console.log('DB connection successful!'));

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log(`App running on port ${port}...`);
});

// Listen for when the client connects via socket.io-client
io.on('connection', async (socket) => {
  const user_id = socket.handshake.query['user_id'];

  console.log(`User connected ${socket?.id}`);

  if (Boolean(user_id)) {
    await User.findByIdAndUpdate(user_id, {
      socket_id: socket.id,
      status: 'Online',
    });
  }

  // Fetch the user's groups from the database
  const user = await User.findById(user_id).populate('groups');

  // Join the user's socket to each group they belong to
  user.groups.forEach(async (group) => {
    group.members.push(socket.id);
    await group.save({ new: true, validateModifiedOnly: true });

    // socket.join(group._id.toString());
  });

  // We can write our socket event listeners in here...
  socket.on('friend_request', async (data) => {
    const to = await User.findById(data.to).select('socket_id');
    const from = await User.findById(data.from).select('socket_id');

    // create a friend request
    await FriendRequest.create({
      sender: data.from,
      recipient: data.to,
    });

    // emit event request received to recipient
    io.to(to.socket_id).emit('new_friend_request', {
      message: 'New friend request received',
    });

    io.to(from.socket_id).emit('request_sent', {
      message: 'Request Sent successfully!',
    });
  });

  socket.on('accept_request', async (data) => {
    // accept friend request => add ref of each other in friends array
    console.log(data);
    const request_doc = await FriendRequest.findById(data.request_id);

    console.log(request_doc);

    const sender = await User.findById(request_doc.sender);
    const receiver = await User.findById(request_doc.recipient);

    sender.friends.push(request_doc.recipient);
    receiver.friends.push(request_doc.sender);

    await receiver.save({ new: true, validateModifiedOnly: true });
    await sender.save({ new: true, validateModifiedOnly: true });

    await FriendRequest.findByIdAndDelete(data.request_id);

    // delete this request doc
    // emit event to both of them

    // emit event request accepted to both
    io.to(sender?.socket_id).emit('request_accepted', {
      message: 'Friend Request Accepted',
    });

    io.to(receiver?.socket_id).emit('request_accepted', {
      message: 'Friend Request Accepted',
    });
  });

  //======================================= One to One Chat ==============================
  socket.on('get_direct_conversations', async ({ user_id }, callback) => {
    const existing_conversations = await OneToOneMessage.find({
      participants: { $all: [user_id] },
    }).populate('participants', 'name _id email status');

    callback(existing_conversations);
  });

  socket.on('start_conversation', async (data) => {
    // data: {to: from:}

    const { to, from } = data;

    // check if there is any existing conversation

    const existing_conversations = await OneToOneMessage.find({
      participants: { $size: 2, $all: [to, from] },
    }).populate('participants', 'name _id email status');

    console.log(existing_conversations[0], 'Existing Conversation');

    // if no => create a new OneToOneMessage doc & emit event "start_chat" & send conversation details as payload
    if (existing_conversations.length === 0) {
      let new_chat = await OneToOneMessage.create({
        participants: [to, from],
      });

      new_chat = await OneToOneMessage.findById(new_chat).populate(
        'participants',
        'name _id email status'
      );

      console.log(new_chat);

      socket.emit('start_chat', new_chat);
    }
    // if yes => just emit event "open_chat" & send conversation details as payload
    else {
      socket.emit('start_chat', existing_conversations[0]);
    }
  });

  socket.on('get_messages', async (data, callback) => {
    const { messages } = await OneToOneMessage.findById(
      data?.conversation_id
    ).select('messages');

    // console.log('from get_messages', messages);
    callback(messages);
  });

  // Handle incoming text/link messages
  socket.on('text_message', async (data) => {
    const { message, conversation_id, from, to, type } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    // message => {to, from, type, created_at, text, file}

    const new_message = {
      to: to,
      from: from,
      type: type,
      created_at: Date.now(),
      text: message,
    };

    // fetch OneToOneMessage Doc & push a new message to existing conversation
    const chat = await OneToOneMessage.findById(conversation_id);

    chat.messages.push(new_message);
    // save to db
    await chat.save({ new: true, validateModifiedOnly: true });

    // emit incoming_message -> to user

    io.to(to_user?.socket_id).emit('new_message', {
      conversation_id,
      message: new_message,
    });

    // emit outgoing_message -> from user
    io.to(from_user?.socket_id).emit('new_message', {
      conversation_id,
      message: new_message,
    });
  });

  // handle Media/Document Message
  socket.on('file_message', (data) => {
    console.log('Received message:', data);

    // data: {to, from, text, file}

    // Get the file extension
    const fileExtension = path.extname(data.file.name);

    // Generate a unique filename
    const filename = `${Date.now()}_${Math.floor(
      Math.random() * 10000
    )}${fileExtension}`;

    // upload file to AWS s3

    // create a new conversation if its dosent exists yet or add a new message to existing conversation

    // save to db

    // emit incoming_message -> to user

    // emit outgoing_message -> from user
  });

  //======================================= One to One Chat ==============================

  //======================================= Audio Call ==============================

  // handle start_audio_call event
  socket.on('start_audio_call', async (data) => {
    const { from, to, roomID } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    // create a new audio call record === log
    await AudioCall.create({
      participants: [from, to],
      from,
      to,
      status: 'Ongoing',
    });

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit('audio_call_notification', {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    });
  });

  // handle audio_call_not_picked
  socket.on('audio_call_not_picked', async (data) => {
    // find and update call record
    const { to, from } = data;

    const to_user = await User.findById(to);

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Missed', status: 'Ended', endedAt: Date.now() }
    );

    // emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit('audio_call_missed', {
      from,
      to,
    });
  });

  // handle audio_call_accepted
  socket.on('audio_call_accepted', async (data) => {
    const { to, from } = data;

    const from_user = await User.findById(from);

    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Accepted' }
    );

    // emit call_accepted to sender of call
    io.to(from_user?.socket_id).emit('audio_call_accepted', {
      from,
      to,
    });
  });

  // handle audio_call_denied
  socket.on('audio_call_denied', async (data) => {
    // find and update call record
    const { to, from } = data;

    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Denied', status: 'Ended', endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit call_denied to sender of call

    io.to(from_user?.socket_id).emit('audio_call_denied', {
      from,
      to,
    });
  });

  // handle user_is_busy_audio_call
  socket.on('user_is_busy_audio_call', async (data) => {
    const { to, from } = data;
    // find and update call record
    await AudioCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Busy', status: 'Ended', endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    // TODO => emit on_another_audio_call to sender of call
    io.to(from_user?.socket_id).emit('on_another_audio_call', {
      from,
      to,
    });
  });

  //======================================= Audio Call ==============================

  //======================================= Video Call ==============================
  // handle start_video_call event
  socket.on('start_video_call', async (data) => {
    const { from, to, roomID } = data;

    const to_user = await User.findById(to);
    const from_user = await User.findById(from);

    // create a new video call record === log
    await VideoCall.create({
      participants: [from, to],
      from,
      to,
      status: 'Ongoing',
    });

    // send notification to receiver of call
    io.to(to_user?.socket_id).emit('video_call_notification', {
      from: from_user,
      roomID,
      streamID: from,
      userID: to,
      userName: to,
    });
  });

  // handle video_call_not_picked
  socket.on('video_call_not_picked', async (data) => {
    console.log(data);
    // find and update call record
    const { to, from } = data;

    const to_user = await User.findById(to);

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Missed', status: 'Ended', endedAt: Date.now() }
    );

    // emit call_missed to receiver of call
    io.to(to_user?.socket_id).emit('video_call_missed', {
      from,
      to,
    });
  });

  // handle video_call_accepted
  socket.on('video_call_accepted', async (data) => {
    const { to, from } = data;

    const from_user = await User.findById(from);

    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Accepted' }
    );

    io.to(from_user?.socket_id).emit('video_call_accepted', {
      from,
      to,
    });
  });

  // handle video_call_denied
  socket.on('video_call_denied', async (data) => {
    // find and update call record
    const { to, from } = data;

    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Denied', status: 'Ended', endedAt: Date.now() }
    );

    const from_user = await User.findById(from);

    // emit call_denied to sender of call

    io.to(from_user?.socket_id).emit('video_call_denied', {
      from,
      to,
    });
  });

  // handle user_is_busy_video_call
  socket.on('user_is_busy_video_call', async (data) => {
    const { to, from } = data;
    // find and update call record
    await VideoCall.findOneAndUpdate(
      {
        participants: { $size: 2, $all: [to, from] },
      },
      { verdict: 'Busy', status: 'Ended', endedAt: Date.now() }
    );

    const from_user = await User.findById(from);
    io.to(from_user?.socket_id).emit('on_another_video_call', {
      from,
      to,
    });
  });

  //======================================= Video Call ==============================

  // ============================ Group Chat =================================

  // Handle incoming text/link messages
  socket.on('group_text_message', async (data) => {
    // data: {to, from, text}

    const { message, conversation_id, from, to, type } = data;

    const from_user = await User.findById(from);

    // message => {to, from, type, created_at, text, file}
    if (from_user) {
      const new_message = {
        to: to,
        from: from,
        type: type,
        created_at: Date.now(),
        text: message,
        sender: from_user.name,
      };

      // fetch OneToOneMessage Doc & push a new message to existing conversation
      const group = await Room.findById(conversation_id);

      // console.log('from group', group, from);
      // console.log('user socket', from_user.socket_id);

      group.messages.push(new_message);
      // save to db
      await group.save({ new: true, validateModifiedOnly: true });

      // emit incoming_message -> to all members

      const errors = [];
      for (const member of group.members) {
        try {
          await io.to(member).emit('new_group_message', {
            conversation_id,
            message: new_message,
          });
        } catch (error) {
          errors.push(error);
        }
      }

      if (errors.length > 0) {
        console.error(
          'Errors occurred while emitting new group message event:',
          errors
        );
      }
    }
  });

  // Handle room creation
  socket.on('createRoom', async (data, callback) => {
    const dubem = await User.findById('642fd7c3322b8ecd6afe1dd4');

    const user = await User.findById(data.owner);

    const room = new Room({
      name: data.title,
      members: [socket?.id],
      owner: data.owner,
      members_id: [data.owner, dubem._id],
    });

    room.save((error, savedRoom) => {
      if (error) {
        console.error('Failed to save room to database:', error);
      } else {
        socket.emit('roomCreated', {
          roomId: savedRoom?._id,
          roomName: savedRoom.name,
        });

        callback({ success: true, message: 'Joined room successfully' });

        user.groups.push(savedRoom?._id);
        dubem.groups.push(savedRoom?._id);

        user.save();
        dubem.save();
      }
    });

    return room;
  });

  // Handle room joining

  socket.on('joinRoom', async (data, callback) => {
    const user = await User.findById(data.user_id);
    const room = await Room.findById(data.roomId);

    if (!room) {
      console.error(`Room ${data.roomId} not found`);
      socket.emit('roomNotFound', `Room ${data.roomId} not found`);
      return;
    }

    room.members.push(socket?.id);

    const groupExist = user.groups.filter((group) => group == data.roomId);

    if (groupExist.length < 1) {
      room.members_id.push(data.user_id);
      user.groups.push(data.roomId);
      await user.save();
    }

    await room.save(async (error) => {
      if (error) {
        console.error('Failed to save room to database:', error);
      } else {
        socket.join(data.roomId);
        socket.emit('roomJoined', {
          roomId: data.roomId,
          roomName: room.name,
        });

        callback({ success: true, message: 'Joined room successfully' });

        // Load the messages for the chat room and send them to the client
        const group = await Room.findById(data.roomId);

        if (!group) {
          console.error('Failed to load messages from database:', error);
        } else {
          socket.emit('loadMessages', group.messages);
        }
      }
    });
  });

  // Handle room leaving
  socket.on('leaveRoom', (roomId) => {
    Room.findById(roomId, (error, room) => {
      if (error) {
        console.error('Failed to find room in database:', error);
      } else if (!room) {
        console.error(`Room ${roomId} not found`);
      } else {
        // Remove the current socket from the room's member list
        room.members = room.members.filter((member) => member !== socket?.id);
        room.save((error) => {
          if (error) {
            console.error('Failed to save room to database:', error);
          } else {
            socket.leave(roomId);
            socket.emit('roomLeft', roomId);
          }
        });
      }
    });
  });

  socket.on('get_direct_group_conversations', async ({ user_id }, callback) => {
    const existing_conversations = await Room.find({
      members_id: { $all: [user_id] },
    });
    // console.log(existing_conversations);

    callback(existing_conversations);
  });

  socket.on('get_group_messages', async (data, callback) => {
    const { messages } = await Room.findById(data?.conversation_id).select(
      'messages'
    );

    // console.log('from get_messages', messages);
    callback(messages);
  });

  // Remove user socket id when the socket id changes
  socket.on('disconnect', async () => {
    const groups = await Room.find({ members: socket?.id });

    // Remove the user's socket id from each group's members array
    groups.forEach(async (group) => {
      // group.members.pull(socket.id);

      group.members = group.members.filter((member) => member !== socket?.id);

      await group.save();
    });

    if (user_id) {
      await User.findByIdAndUpdate(user_id, { status: 'Offline' });
    }
  });

  socket.on('disconnect_on_reload', async () => {
    const groups = await Room.find({ members: socket.id });

    // Remove the user's socket id from each group's members array
    groups.forEach(async (group) => {
      // group.members.pull(socket.id);

      group.members = group.members.filter((member) => member !== socket.id);

      await group.save();
    });
  });

  // ============================ Group Chat =================================

  socket.on('end', async (data) => {
    if (data?.user_id) {
      await User.findByIdAndUpdate(data.user_id, { status: 'Offline' });
    }

    // Find all the groups the user is a member of
    const groups = await Room.find({ members: socket.id });

    // Remove the user's socket id from each group's members array
    groups.forEach(async (group) => {
      // group.members.pull(socket.id);

      group.members = group.members.filter((member) => member !== socket.id);

      await group.save();

      //   // Emit a message to all members of the group to notify them of the user's disconnection
      //   io.to(group._id).emit('user_disconnected', { user_id: socket.id });
    });

    console.log('closing connection');
    // socket.disconnect(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
