// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Resend } = require('resend');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const sanitizeHtml = require('sanitize-html');

const app = express();

// ============ RESEND EMAIL SERVICE ============
const resend = new Resend(process.env.RESEND_API_KEY);

// Verify API key exists
if (!process.env.RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY not set in environment variables');
  console.log('📧 Please get your API key from https://resend.com');
} else {
  console.log('✅ Resend email service configured');
}

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(cors({
  origin: [
    'https://hire-hub-11dz.vercel.app', // Your frontend URL
    'http://localhost:3000' // For local development
  ],
  methods: ['POST', 'GET'],
  credentials: true
}));

// Rate limiting to prevent spam
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many contact submissions, please try again later'
});

// ============ MONGODB CONNECTION ============
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Error:', err));

// ============ MONGODB SCHEMA ============
const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 5000
  },
  status: {
    type: String,
    enum: ['received', 'read', 'replied'],
    default: 'received'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  ipAddress: String
});

const Contact = mongoose.model('Contact', contactSchema);

// ============ VALIDATION FUNCTIONS ============
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateName(name) {
  // Only alphabets, spaces, and hyphens allowed
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  return nameRegex.test(name) && name.length >= 2;
}

// ============ EMAIL SENDING FUNCTION ============
async function sendEmailToAdmin(name, email, description) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; border-radius: 8px;">
      <div style="background: white; padding: 30px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; margin-top: 0; border-bottom: 3px solid #667eea; padding-bottom: 10px;">
          🎯 New Contact Form Submission
        </h2>
        
        <div style="margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>📝 Name:</strong> ${name}</p>
          <p style="margin: 5px 0;"><strong>📧 Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p style="margin: 5px 0;"><strong>📅 Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>
 
        <div style="background: #f5f5f5; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px;">
          <h3 style="color: #333; margin-top: 0;">Project Description:</h3>
          <p style="color: #555; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word;">${description}</p>
        </div>
 
        <div style="background: #e8f5e9; padding: 15px; border-radius: 4px; margin: 20px 0;">
          <p style="margin: 0; color: #2e7d32; font-size: 14px;">
            ✅ <strong>Status:</strong> New submission received and stored in database
          </p>
        </div>
 
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        
        <p style="text-align: center; color: #999; font-size: 12px; margin-bottom: 0;">
          This is an automated email from your portfolio contact form.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: 'Contact Form <onboarding@resend.dev>',
      to: process.env.ADMIN_EMAIL,
      subject: `📬 New Contact Form: Project from ${name}`,
      html: htmlContent,
      replyTo: email
    });

    if (result.error) {
      throw result.error;
    }

    console.log('✅ Admin email sent via Resend:', result.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send admin email:', error);
    throw error;
  }
}

// Send confirmation email to user
async function sendConfirmationEmailToUser(name, email) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; border-radius: 8px;">
      <div style="background: white; padding: 30px; border-radius: 8px; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; margin-top: 0;">
          ✅ Message Received Successfully!
        </h2>
        
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>,
        </p>
 
        <p style="color: #555; line-height: 1.6;">
          Thank you for reaching out! Your contact form submission has been received and saved to our system.
        </p>
 
        <div style="background: #f5f5f5; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 5px 0; color: #555;"><strong>What happens next:</strong></p>
          <ul style="color: #555; margin: 10px 0;">
            <li>We'll review your project requirements</li>
            <li>Our team will analyze the scope and timeline</li>
            <li>We'll get back to you within 24-48 hours</li>
          </ul>
        </div>
 
        <p style="color: #555; line-height: 1.6;">
          If you have any urgent matters, feel free to call <strong>+91 9840549063</strong>
        </p>
 
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        
        <p style="text-align: center; color: #999; font-size: 12px; margin-bottom: 0;">
          © 2024 Abhijit V. All rights reserved.
        </p>
      </div>
    </div>
  `;

  try {
    const result = await resend.emails.send({
      from: 'Contact Form <onboarding@resend.dev>',
      to: email,
      subject: '✅ We Received Your Message - Response Coming Soon',
      html: htmlContent
    });

    if (result.error) {
      throw result.error;
    }

    console.log('✅ User confirmation email sent via Resend:', result.id);
    return result;
  } catch (error) {
    console.error('❌ Failed to send confirmation email:', error);
    throw error;
  }
}

// ============ API ENDPOINTS ============

// GET all contacts (admin only - optional)
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ submittedAt: -1 });
    res.json({ success: true, count: contacts.length, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST contact form submission
app.post('/api/contact', limiter, async (req, res) => {
  try {
    const { name, email, description } = req.body;

    // ============ VALIDATION ============
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Name is required and cannot be empty'
      });
    }

    if (!validateName(name)) {
      return res.status(400).json({
        success: false,
        error: 'Name should contain only letters, spaces, hyphens, and apostrophes'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Email is required and cannot be empty'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address'
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Description is required'
      });
    }

    if (description.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Description must be at least 10 characters'
      });
    }

    // ============ SANITIZATION ============
    const cleanDescription = sanitizeHtml(description, {
      allowedTags: [],
      allowedAttributes: {}
    });

    // ============ SAVE TO DATABASE ============
    const newContact = new Contact({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      description: cleanDescription.trim(),
      ipAddress: req.ip
    });

    await newContact.save();
    console.log('✅ Contact saved:', newContact._id);

    // ============ SEND EMAILS ============
    try {
      // Send to admin
      await sendEmailToAdmin(name.trim(), email.trim(), cleanDescription);
      console.log('✅ Admin email sent');

      // Send confirmation to user
      await sendConfirmationEmailToUser(name.trim(), email.trim());
      console.log('✅ User confirmation email sent');
    } catch (emailError) {
      console.error('⚠️ Email sending failed:', emailError.message);
      // Don't fail the request if email fails - data is still saved
    }

    // ============ SUCCESS RESPONSE ============
    res.status(201).json({
      success: true,
      message: 'Your message has been received! We will get back to you soon.',
      submissionId: newContact._id,
      timestamp: newContact.submittedAt
    });

  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({
      success: false,
      error: 'An error occurred while processing your request. Please try again.'
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running ✅' });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Admin email: ${process.env.ADMIN_EMAIL}`);
});
