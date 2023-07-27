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

  console.log(`User connected ${socket.id}`);

  if (Boolean(user_id)) {
    await User.findByIdAndUpdate(user_id, {
      socket_id: socket.id,
      status: 'Online',
    });
  }

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
    io.to(sender.socket_id).emit('request_accepted', {
      message: 'Friend Request Accepted',
    });

    io.to(receiver.socket_id).emit('request_accepted', {
      message: 'Friend Request Accepted',
    });
  });

  socket.on('get_direct_conversations', async ({ user_id }, callback) => {
    const existing_conversations = await OneToOneMessage.find({
      participants: { $all: [user_id] },
    }).populate('participants', 'name _id email status');

    // db.books.find({ authors: { $elemMatch: { name: "John Smith" } } })

    console.log(existing_conversations);

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
      socket.emit('open_chat', existing_conversations[0]);
    }
  });

  socket.on('get_messages', async (data, callback) => {
    const { messages } = await OneToOneMessage.findById(
      data.conversation_id
    ).select('messages');
    callback(messages);
  });

  // Handle incoming text/link messages
  socket.on('text_message', async (data) => {
    console.log('Received message:', data);

    // data: {to, from, text}

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

    io.to(to_user.socket_id).emit('new_message', {
      conversation_id,
      message: new_message,
    });

    // emit outgoing_message -> from user
    io.to(from_user.socket_id).emit('new_message', {
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

  socket.on('end', async (data) => {
    if (data.user_id) {
      await User.findByIdAndUpdate(data.user_id, { status: 'Offline' });
    }
    console.log('closing connection');
    socket.disconnect(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
