// ============================================
// PATHS TIGER TAEKWONDO ACADEMY - COMPLETE BACKEND
// Single File Version - Everything in one place!
// ============================================

const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');
const moment = require('moment');
const path = require('path'); // ADD THIS - for file paths

const app = express();
const PORT = 5000;

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'],
    credentials: true
}));

// ============================================
// SERVE STATIC FILES (YOUR HTML PAGES)
// ============================================

// Serve files from "public" folder (where your HTML files will go)
app.use(express.static('public'));

// Serve images from "images" folder
app.use('/images', express.static('images'));

// Optional: Also serve from current directory if needed
app.use(express.static(__dirname));

// Redirect root to index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// DATABASE CONNECTION (MySQL)
// ============================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root123', // Change this to your MySQL password
    database: 'paths_tiger_db'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        return;
    }
    console.log('✅ Connected to MySQL database');
    
    // Create tables if they don't exist
    createTables();
});

// ============================================
// CREATE DATABASE TABLES
// ============================================
function createTables() {
    // Members table
    db.query(`
        CREATE TABLE IF NOT EXISTS members (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            address TEXT,
            dateOfBirth DATE,
            beltLevel ENUM('white','yellow','green','blue','red','black') DEFAULT 'white',
            joinDate DATE,
            emergencyContact VARCHAR(100),
            emergencyPhone VARCHAR(20),
            isActive BOOLEAN DEFAULT true,
            role ENUM('member','admin','instructor') DEFAULT 'member',
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Error creating members table:', err);
        else console.log('✅ Members table ready');
    });

    // Payments table
    db.query(`
        CREATE TABLE IF NOT EXISTS payments (
            id INT PRIMARY KEY AUTO_INCREMENT,
            memberId INT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            paymentMethod ENUM('jazzcash','easypaisa','card','bank') NOT NULL,
            transactionId VARCHAR(100) UNIQUE,
            jazzcashTransactionId VARCHAR(100),
            status ENUM('pending','completed','failed','refunded') DEFAULT 'pending',
            paymentDate DATETIME,
            description VARCHAR(255),
            forMonth VARCHAR(7),
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) console.error('Error creating payments table:', err);
        else console.log('✅ Payments table ready');
    });

    // Contact table
    db.query(`
        CREATE TABLE IF NOT EXISTS contacts (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL,
            phone VARCHAR(20),
            subject VARCHAR(200),
            message TEXT NOT NULL,
            status ENUM('new','read','replied') DEFAULT 'new',
            notes TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('Error creating contacts table:', err);
        else console.log('✅ Contacts table ready');
    });

    // Belt Progress table
    db.query(`
        CREATE TABLE IF NOT EXISTS belt_progress (
            id INT PRIMARY KEY AUTO_INCREMENT,
            memberId INT NOT NULL UNIQUE,
            currentBelt ENUM('white','yellow','green','blue','red','black') DEFAULT 'white',
            requirementsCompleted JSON,
            nextTestDate DATE,
            classesAttended INT DEFAULT 0,
            sparringScore INT DEFAULT 0,
            formsScore INT DEFAULT 0,
            breakingScore INT DEFAULT 0,
            instructorNotes TEXT,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE
        )
    `, (err) => {
        if (err) console.error('Error creating belt_progress table:', err);
        else console.log('✅ Belt progress table ready');
    });

    // Attendance table
    db.query(`
        CREATE TABLE IF NOT EXISTS attendance (
            id INT PRIMARY KEY AUTO_INCREMENT,
            memberId INT NOT NULL,
            classDate DATE NOT NULL,
            classType ENUM('little_tigers','junior','teen','adult','family') NOT NULL,
            status ENUM('present','absent','makeup') DEFAULT 'present',
            checkInTime TIME,
            notes VARCHAR(255),
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
            UNIQUE KEY unique_attendance (memberId, classDate, classType)
        )
    `, (err) => {
        if (err) console.error('Error creating attendance table:', err);
        else console.log('✅ Attendance table ready');
    });
}

// ============================================
// EMAIL CONFIGURATION
// ============================================
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'pathstiger1@gmail.com',
        pass: 'your_app_password_here' // Replace with your Gmail App Password
    }
});

function sendEmail(to, subject, html) {
    const mailOptions = {
        from: '"Paths Tiger Academy" <pathstiger1@gmail.com>',
        to,
        subject,
        html
    };
    
    return transporter.sendMail(mailOptions);
}

// ============================================
// JWT FUNCTIONS
// ============================================
const JWT_SECRET = 'your_jwt_secret_key_change_this_123456';

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    
    db.query('SELECT id, name, email, phone, beltLevel, role FROM members WHERE id = ?', 
        [decoded.id], 
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(403).json({ success: false, message: 'User not found' });
            }
            req.user = results[0];
            next();
        }
    );
}

// ============================================
// API ROUTES
// ============================================

// ---------- HEALTH CHECK ----------
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Paths Tiger API is running',
        timestamp: new Date(),
        version: '1.0.0'
    });
});

// ---------- REGISTER ----------
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone, address, dateOfBirth } = req.body;
        
        // Check if user exists
        db.query('SELECT * FROM members WHERE email = ?', [email], async (err, results) => {
            if (err) throw err;
            if (results.length > 0) {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
            
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Insert new member
            const member = {
                name,
                email,
                password: hashedPassword,
                phone,
                address,
                dateOfBirth,
                joinDate: moment().format('YYYY-MM-DD'),
                beltLevel: 'white',
                role: 'member'
            };
            
            db.query('INSERT INTO members SET ?', member, (err, result) => {
                if (err) throw err;
                
                // Create belt progress record
                const beltProgress = {
                    memberId: result.insertId,
                    currentBelt: 'white',
                    requirementsCompleted: JSON.stringify({
                        basicStances: false,
                        frontKick: false,
                        roundhouse: false,
                        form1: false,
                        koreanTerms: false
                    })
                };
                
                db.query('INSERT INTO belt_progress SET ?', beltProgress, (err) => {
                    if (err) console.error('Error creating belt progress:', err);
                });
                
                // Generate token
                const token = generateToken({ id: result.insertId, email, role: 'member' });
                
                // Send welcome email
                const welcomeEmail = `
                    <div style="font-family: Arial, sans-serif;">
                        <h2 style="color: #F97316;">Welcome to Paths Tiger Academy!</h2>
                        <p>Dear ${name},</p>
                        <p>Thank you for joining Paths Tiger Taekwondo Academy. We're excited to have you!</p>
                        <p>Your account has been created successfully.</p>
                        <p>You can now login to your member area.</p>
                        <p>Best regards,<br>Paths Tiger Team</p>
                    </div>
                `;
                
                sendEmail(email, 'Welcome to Paths Tiger Academy!', welcomeEmail).catch(console.error);
                
                res.status(201).json({
                    success: true,
                    message: 'Registration successful',
                    token,
                    user: {
                        id: result.insertId,
                        name,
                        email,
                        phone,
                        beltLevel: 'white'
                    }
                });
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// ---------- LOGIN ----------
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        db.query('SELECT * FROM members WHERE email = ? AND isActive = true', [email], async (err, results) => {
            if (err) throw err;
            if (results.length === 0) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }
            
            const user = results[0];
            const validPassword = await bcrypt.compare(password, user.password);
            
            if (!validPassword) {
                return res.status(401).json({ success: false, message: 'Invalid email or password' });
            }
            
            const token = generateToken(user);
            
            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    phone: user.phone,
                    beltLevel: user.beltLevel,
                    role: user.role
                }
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// ---------- GET PROFILE ----------
app.get('/api/auth/profile', authenticateToken, (req, res) => {
    db.query(`
        SELECT m.*, bp.* 
        FROM members m 
        LEFT JOIN belt_progress bp ON m.id = bp.memberId 
        WHERE m.id = ?
    `, [req.user.id], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Database error' });
        }
        
        const user = results[0];
        delete user.password;
        
        res.json({
            success: true,
            user
        });
    });
});

// ---------- UPDATE PROFILE ----------
app.put('/api/auth/profile', authenticateToken, (req, res) => {
    const { name, phone, address, emergencyContact, emergencyPhone } = req.body;
    
    db.query(
        'UPDATE members SET name = ?, phone = ?, address = ?, emergencyContact = ?, emergencyPhone = ? WHERE id = ?',
        [name, phone, address, emergencyContact, emergencyPhone, req.user.id],
        (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Update failed' });
            }
            
            res.json({
                success: true,
                message: 'Profile updated successfully'
            });
        }
    );
});

// ---------- CONTACT FORM ----------
app.post('/api/contact', (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        
        const contact = {
            name,
            email,
            phone,
            subject: subject || 'General Inquiry',
            message,
            status: 'new'
        };
        
        db.query('INSERT INTO contacts SET ?', contact, (err, result) => {
            if (err) throw err;
            
            // Send email to admin
            const adminEmail = `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #F97316;">New Contact Form Submission</h2>
                    <p><strong>Name:</strong> ${name}</p>
                    <p><strong>Email:</strong> ${email}</p>
                    <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                    <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
                    <p><strong>Message:</strong></p>
                    <p>${message}</p>
                </div>
            `;
            
            sendEmail('pathstiger1@gmail.com', 'New Contact Form Submission', adminEmail).catch(console.error);
            
            // Send auto-reply to user
            const autoReply = `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #F97316;">Thank You for Contacting Us!</h2>
                    <p>Dear ${name},</p>
                    <p>We have received your message and will get back to you within 24 hours.</p>
                    <p>Best regards,<br>Paths Tiger Team</p>
                </div>
            `;
            
            sendEmail(email, 'Thank you for contacting Paths Tiger', autoReply).catch(console.error);
            
            res.json({
                success: true,
                message: 'Message sent successfully',
                contactId: result.insertId
            });
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
});

// ---------- GET DASHBOARD ----------
app.get('/api/member/dashboard', authenticateToken, (req, res) => {
    const memberId = req.user.id;
    
    // Get belt progress
    db.query('SELECT * FROM belt_progress WHERE memberId = ?', [memberId], (err, beltResults) => {
        if (err) console.error('Belt progress error:', err);
        
        // Get recent payments
        db.query('SELECT * FROM payments WHERE memberId = ? ORDER BY createdAt DESC LIMIT 5', 
            [memberId], (err, paymentResults) => {
            if (err) console.error('Payment error:', err);
            
            // Get attendance
            db.query('SELECT COUNT(*) as total, SUM(CASE WHEN status = "present" THEN 1 ELSE 0 END) as present FROM attendance WHERE memberId = ? AND classDate >= DATE_SUB(NOW(), INTERVAL 30 DAY)', 
                [memberId], (err, attendanceResults) => {
                if (err) console.error('Attendance error:', err);
                
                const total = attendanceResults[0]?.total || 0;
                const present = attendanceResults[0]?.present || 0;
                const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
                
                // Dashboard data
                const dashboard = {
                    stats: {
                        classesAttended: present,
                        daysUntilNextBelt: 3,
                        attendanceRate,
                        achievements: 5
                    },
                    schedule: [
                        { day: 'Monday', time: '4:00 PM', type: 'Little Tigers', isToday: true },
                        { day: 'Wednesday', time: '4:00 PM', type: 'Junior', isToday: false },
                        { day: 'Friday', time: '4:00 PM', type: 'Family', isToday: false }
                    ],
                    announcements: [
                        { title: 'Belt Testing - March 30th', description: 'All students must confirm attendance by March 25th', date: '2 days ago', color: 'orange' },
                        { title: 'Academy Closed - March 23rd', description: 'Due to maintenance', date: '5 days ago', color: 'blue' },
                        { title: 'New Uniforms Arrived', description: 'Available for purchase at front desk', date: '1 week ago', color: 'green' }
                    ],
                    beltProgress: beltResults[0] || {
                        currentBelt: req.user.beltLevel,
                        requirementsCompleted: {}
                    },
                    recentPayments: paymentResults || []
                };
                
                res.json({
                    success: true,
                    dashboard
                });
            });
        });
    });
});

// ---------- JAZZCASH PAYMENT INITIATION ----------
app.post('/api/payments/jazzcash/initiate', authenticateToken, (req, res) => {
    try {
        const { amount, forMonth } = req.body;
        const memberId = req.user.id;
        
        // Generate order ID
        const orderId = `TKD${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        // Create pending payment record
        const payment = {
            memberId,
            amount,
            paymentMethod: 'jazzcash',
            transactionId: orderId,
            status: 'pending',
            forMonth: forMonth || moment().format('YYYY-MM')
        };
        
        db.query('INSERT INTO payments SET ?', payment, (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Payment creation failed' });
            }
            
            // Return payment instructions
            res.json({
                success: true,
                paymentId: result.insertId,
                orderId,
                message: 'Please complete payment via JazzCash',
                instructions: {
                    accountNumber: '0317-4084613',
                    accountTitle: 'Paths Tiger Taekwondo',
                    amount: `Rs. ${amount}`,
                    steps: [
                        'Open JazzCash app',
                        'Select "Send Money"',
                        'Enter mobile number: 0317-4084613',
                        `Enter amount: Rs. ${amount}`,
                        'Add order ID in description: ' + orderId,
                        'Confirm payment'
                    ]
                }
            });
        });
    } catch (error) {
        console.error('JazzCash error:', error);
        res.status(500).json({ success: false, message: 'Payment initiation failed' });
    }
});

// ---------- EASYPAISA PAYMENT INITIATION ----------
app.post('/api/payments/easypaisa/initiate', authenticateToken, (req, res) => {
    try {
        const { amount, forMonth } = req.body;
        const memberId = req.user.id;
        
        // Generate order ID
        const orderId = `EP${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        // Create pending payment record
        const payment = {
            memberId,
            amount,
            paymentMethod: 'easypaisa',
            transactionId: orderId,
            status: 'pending',
            forMonth: forMonth || moment().format('YYYY-MM')
        };
        
        db.query('INSERT INTO payments SET ?', payment, (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Payment creation failed' });
            }
            
            // Return payment instructions
            res.json({
                success: true,
                paymentId: result.insertId,
                orderId,
                message: 'Please complete payment via Easypaisa',
                instructions: {
                    accountNumber: '0317-4084613',
                    accountTitle: 'Paths Tiger Taekwondo',
                    amount: `Rs. ${amount}`,
                    steps: [
                        'Open Easypaisa app',
                        'Select "Send Money"',
                        'Enter mobile number: 0317-4084613',
                        `Enter amount: Rs. ${amount}`,
                        'Add order ID in description: ' + orderId,
                        'Confirm payment'
                    ]
                }
            });
        });
    } catch (error) {
        console.error('Easypaisa error:', error);
        res.status(500).json({ success: false, message: 'Payment initiation failed' });
    }
});

// ---------- CONFIRM MANUAL PAYMENT ----------
app.post('/api/payments/confirm', authenticateToken, (req, res) => {
    try {
        const { paymentId, transactionId } = req.body;
        
        db.query(
            'UPDATE payments SET status = ?, jazzcashTransactionId = ?, paymentDate = NOW() WHERE id = ? AND memberId = ?',
            ['completed', transactionId, paymentId, req.user.id],
            (err, result) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Confirmation failed' });
                }
                
                if (result.affectedRows === 0) {
                    return res.status(404).json({ success: false, message: 'Payment not found' });
                }
                
                // Get member email for notification
                db.query('SELECT email, name FROM members WHERE id = ?', [req.user.id], (err, userResults) => {
                    if (!err && userResults.length > 0) {
                        const user = userResults[0];
                        
                        // Send confirmation email
                        const emailHtml = `
                            <div style="font-family: Arial, sans-serif;">
                                <h2 style="color: #F97316;">Payment Successful!</h2>
                                <p>Dear ${user.name},</p>
                                <p>Your payment has been confirmed successfully.</p>
                                <p><strong>Transaction ID:</strong> ${transactionId}</p>
                                <p>Thank you for your continued support!</p>
                            </div>
                        `;
                        
                        sendEmail(user.email, 'Payment Confirmed - Paths Tiger Academy', emailHtml).catch(console.error);
                    }
                });
                
                res.json({
                    success: true,
                    message: 'Payment confirmed successfully'
                });
            }
        );
    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ success: false, message: 'Confirmation failed' });
    }
});

// ---------- GET PAYMENT HISTORY ----------
app.get('/api/payments/history', authenticateToken, (req, res) => {
    db.query(
        'SELECT * FROM payments WHERE memberId = ? ORDER BY createdAt DESC',
        [req.user.id],
        (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Failed to fetch payments' });
            }
            
            res.json({
                success: true,
                payments: results
            });
        }
    );
});

// ---------- GET BELT PROGRESS ----------
app.get('/api/member/belt-progress', authenticateToken, (req, res) => {
    db.query(
        'SELECT * FROM belt_progress WHERE memberId = ?',
        [req.user.id],
        (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Failed to fetch belt progress' });
            }
            
            const beltRequirements = {
                white: ['Basic Stances', 'Front Kick', 'Blocking', 'Korean Counting', 'Basic Form', 'Class Etiquette'],
                yellow: ['Roundhouse Kick', 'Side Kick', 'Form 1', 'One-step Sparring', 'Board Breaking', 'Korean Commands'],
                green: ['Back Kick', 'Hook Kick', 'Form 2', 'Free Sparring', 'Self-Defense', 'Terminology'],
                blue: ['Jump Kicks', 'Form 3', 'Form 4', 'Sparring Combos', 'Breaking 2 boards', 'Teaching basics'],
                red: ['Form 5', 'Form 6', 'Advanced Sparring', 'Multiple Breaks', 'Demo Team Prep', 'Leadership'],
                black: ['All Forms 1-8', 'Black Belt Form', 'Board Breaking', 'Sparring Tournament', 'Essay/Written', 'Community Service']
            };
            
            res.json({
                success: true,
                currentBelt: req.user.beltLevel,
                beltProgress: results[0] || {},
                beltRequirements
            });
        }
    );
});

// ---------- GET ATTENDANCE ----------
app.get('/api/member/attendance', authenticateToken, (req, res) => {
    const { month, year } = req.query;
    let query = 'SELECT * FROM attendance WHERE memberId = ?';
    let params = [req.user.id];
    
    if (month && year) {
        query += ' AND YEAR(classDate) = ? AND MONTH(classDate) = ?';
        params.push(year, month);
    }
    
    query += ' ORDER BY classDate DESC';
    
    db.query(query, params, (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
        }
        
        res.json({
            success: true,
            attendance: results
        });
    });
});

// ---------- CREATE ADMIN USER (Run once) ----------
app.get('/api/setup-admin', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash('Admin@123', 10);
        
        const admin = {
            name: 'Admin',
            email: 'admin@pathstiger.com',
            password: hashedPassword,
            phone: '0317-4084613',
            role: 'admin',
            joinDate: moment().format('YYYY-MM-DD'),
            isActive: true
        };
        
        db.query('INSERT INTO members SET ?', admin, (err) => {
            if (err && err.code === 'ER_DUP_ENTRY') {
                res.json({ message: 'Admin user already exists' });
            } else if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ message: 'Admin user created successfully' });
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📝 API available at http://localhost:${PORT}/api`);
    console.log(`✅ Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌐 Your website: http://localhost:${PORT}/`);
    console.log(`📁 Place HTML files in the "public" folder`);
});