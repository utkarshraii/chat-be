const nodeMailer = require('nodemailer');

const sendEmail = async ({ to, subject, html, attachments, text }) => {
  try {
    const from = process.env.EMAIL_FROM;
    const msg = {
      to: to,
      from: from,
      subject: subject,
      html: html,
      attachments,
    };

    nodeMailer
      .createTransport({
        service: 'gmail',
        auth: {
          user: from,
          pass: process.env.MAIL_PASS,
        },
        port: 465,
        host: 'smtp.gmail.com',
      })
      .sendMail(msg, (err) => {
        if (err) {
          return console.log('Error occurred: ' + err);
        } else {
          return console.log('Email Sent');
        }
      });
  } catch (error) {
    console.log(error);
  }
};

exports.sendMail = async (args) => {
  if (!process.env.NODE_ENV === 'development') {
    return Promise.resolve();
  } else {
    return sendEmail(args);
  }
};
