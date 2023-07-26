/* eslint-disable no-console */
const nodemailer = require('nodemailer');
//const mg = require("mailgun-js");
const pug = require('pug');
// const htmlToText  = require('html-to-text');
const { convert } = require('html-to-text');

module.exports = class Email {
  constructor(user, url, otp) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.otp = otp;
    this.from = `Chat <${process.env.FROM_EMAIL_ID}>`;
  }

  newTransport() {
    return nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: process.env.FROM_EMAIL_ID,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  // Send the actual email
  async send(template, subject) {
    // 1) Render HTML based on a pug template
    const html = pug.renderFile(`${__dirname}/../views/email/${template}.pug`, {
      firstName: this.firstName,
      url: this.url,
      otp: this.otp,
      subject,
    });

    // 2) Define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      html,
      text: convert(html, {
        wordwrap: 130,
      }),
      // text: htmlToText.fromString(html)
    };

    // 3) Create a transport and send email
    await this.newTransport().sendMail(mailOptions, function (err, info) {
      if (err) {
        console.log(err);
      } else {
        console.log(info.response);
      }
    });
  }

  async sendWelcome() {
    await this.send('welcome', 'Welcome to CALChat Family!');
  }

  async sendPasswordReset() {
    await this.send(
      'passwordReset',
      'Your password reset token (valid for only 10 minutes)'
    );
  }

  async sendOTPVerify() {
    await this.send(
      'sendOTP',
      `Your OTP token ${this.otp} (valid for only 10 minutes)`
    );
  }
};
// module.exports = class Email {
//   constructor(user, url, otp) {
//     this.to = user.email;
//     this.firstName = user.name.split(" ")[0];
//     this.url = url;
//     this.otp = otp;
//     this.from = `Chat <${process.env.FROM_EMAIL_ID}>`;
//   }

//   newTransport() {
//     if (process.env.NODE_ENV === "production") {
//       // Sendgrid
//       return nodemailer.createTransport({
//         service: "gmail",
//         auth: {
//           user: process.env.MAIL_USERNAME,
//           pass: process.env.MAIL_PASS,
//         },
//       });
//     }

// return nodemailer.createTransport({
//   host: process.env.EMAIL_HOST,
//   port: process.env.EMAIL_PORT,
//   auth: {
//     user: process.env.EMAIL_USERNAME,
//     pass: process.env.EMAIL_PASSWORD,
//   },
// });
// return nodemailer.createTransport({
//   service: 'SendGrid',
//   auth: {
//     user: process.env.SENDGRID_USERNAME,
//     pass: process.env.SENDGRID_PASSWORD,
//   },
// });
// console.log('working');

//   return nodemailer.createTransport({
//     // service: 'SendGrid',
//     host: "smtp.gmail.com",
//     port: 465,
//     secure: true,
//     auth: {
//       user: process.env.MAIL_USERNAME,
//       pass: process.env.MAIL_PASS,
//     },
//   });
// }

//   mailgun() {
//     return mg({
//       apiKey: process.env.MAILGUN_API_KEY,
//       domain: process.env.MAILGUN_DOMIAN,
//     });
//   }
