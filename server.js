// ============================================
// PATHS TIGER TAEKWONDO ACADEMY - COMPLETE BACKEND
// Single File Version - With Admin & Instructor Routes
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
const path = require('path');

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
// SERVE STATIC FILES
// ============================================
app.use(express.static('public'));
app.use('/images', express.static('images'));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// DATABASE CONNECTION
// ============================================
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root123',
    database: 'paths_tiger_db'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err);
        return;
    }
    console.log('✅ Connected to MySQL database');
    createTables();
});

// ============================================
// CREATE DATABASE TABLES
// ============================================
function createTables() {
    // Members table (includes role field for admin/instructor/member)
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
            program VARCHAR(50) DEFAULT 'Little Tigers',
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
        pass: 'your_app_password_here'
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
    
    db.query('SELECT id, name, email, phone, beltLevel, role, program FROM members WHERE id = ?', 
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

// Admin middleware
function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    next();
}

// Instructor middleware
function requireInstructor(req, res, next) {
    if (req.user.role !== 'instructor' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Instructor access required' });
    }
    next();
}

// ============================================
// PUBLIC ROUTES
// ============================================

app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Paths Tiger API is running', timestamp: new Date(), version: '1.0.0' });
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone, address, dateOfBirth, program } = req.body;
        
        db.query('SELECT * FROM members WHERE email = ?', [email], async (err, results) => {
            if (err) throw err;
            if (results.length > 0) {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const member = {
                name,
                email,
                password: hashedPassword,
                phone,
                address,
                dateOfBirth,
                joinDate: moment().format('YYYY-MM-DD'),
                beltLevel: 'white',
                program: program || 'Little Tigers',
                role: 'member'
            };
            
            db.query('INSERT INTO members SET ?', member, (err, result) => {
                if (err) throw err;
                
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
                
                const token = generateToken({ id: result.insertId, email, role: 'member' });
                
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
                    user: { id: result.insertId, name, email, phone, beltLevel: 'white', role: 'member' }
                });
            });
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// Login
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

// Get profile
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
        res.json({ success: true, user });
    });
});

// Update profile
app.put('/api/auth/profile', authenticateToken, (req, res) => {
    const { name, phone, address, emergencyContact, emergencyPhone } = req.body;
    
    db.query(
        'UPDATE members SET name = ?, phone = ?, address = ?, emergencyContact = ?, emergencyPhone = ? WHERE id = ?',
        [name, phone, address, emergencyContact, emergencyPhone, req.user.id],
        (err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Update failed' });
            }
            res.json({ success: true, message: 'Profile updated successfully' });
        }
    );
});

// Contact form
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
            
            const autoReply = `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #F97316;">Thank You for Contacting Us!</h2>
                    <p>Dear ${name},</p>
                    <p>We have received your message and will get back to you within 24 hours.</p>
                    <p>Best regards,<br>Paths Tiger Team</p>
                </div>
            `;
            
            sendEmail(email, 'Thank you for contacting Paths Tiger', autoReply).catch(console.error);
            
            res.json({ success: true, message: 'Message sent successfully', contactId: result.insertId });
        });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
    }
});

// ============================================
// MEMBER ROUTES
// ============================================

app.get('/api/member/dashboard', authenticateToken, (req, res) => {
    const memberId = req.user.id;
    
    db.query('SELECT * FROM belt_progress WHERE memberId = ?', [memberId], (err, beltResults) => {
        if (err) console.error('Belt progress error:', err);
        
        db.query('SELECT * FROM payments WHERE memberId = ? ORDER BY createdAt DESC LIMIT 5', [memberId], (err, paymentResults) => {
            if (err) console.error('Payment error:', err);
            
            db.query('SELECT COUNT(*) as total, SUM(CASE WHEN status = "present" THEN 1 ELSE 0 END) as present FROM attendance WHERE memberId = ? AND classDate >= DATE_SUB(NOW(), INTERVAL 30 DAY)', [memberId], (err, attendanceResults) => {
                if (err) console.error('Attendance error:', err);
                
                const total = attendanceResults[0]?.total || 0;
                const present = attendanceResults[0]?.present || 0;
                const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
                
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
                    beltProgress: beltResults[0] || { currentBelt: req.user.beltLevel, requirementsCompleted: {} },
                    recentPayments: paymentResults || []
                };
                
                res.json({ success: true, dashboard });
            });
        });
    });
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all members
app.get('/api/admin/members', authenticateToken, requireAdmin, (req, res) => {
    db.query('SELECT id, name, email, phone, beltLevel, program, joinDate, isActive, role FROM members ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json(results);
    });
});

// Get single member details
app.get('/api/admin/members/:id', authenticateToken, requireAdmin, (req, res) => {
    db.query('SELECT * FROM members WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        if (results.length === 0) return res.status(404).json({ success: false, message: 'Member not found' });
        delete results[0].password;
        res.json(results[0]);
    });
});

// Update member
app.put('/api/admin/members/:id', authenticateToken, requireAdmin, (req, res) => {
    const { name, email, phone, beltLevel, program, role, isActive } = req.body;
    db.query('UPDATE members SET name=?, email=?, phone=?, beltLevel=?, program=?, role=?, isActive=? WHERE id=?',
        [name, email, phone, beltLevel, program, role, isActive, req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Update failed' });
        res.json({ success: true, message: 'Member updated' });
    });
});

// Delete member
app.delete('/api/admin/members/:id', authenticateToken, requireAdmin, (req, res) => {
    db.query('DELETE FROM members WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Delete failed' });
        res.json({ success: true, message: 'Member deleted' });
    });
});

// Get all payments
app.get('/api/admin/payments', authenticateToken, requireAdmin, (req, res) => {
    db.query('SELECT * FROM payments ORDER BY createdAt DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json(results);
    });
});

// Update payment status
app.put('/api/admin/payments/:id', authenticateToken, requireAdmin, (req, res) => {
    const { status } = req.body;
    db.query('UPDATE payments SET status = ? WHERE id = ?', [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Update failed' });
        res.json({ success: true, message: 'Payment status updated' });
    });
});

// Get all contacts
app.get('/api/admin/contacts', authenticateToken, requireAdmin, (req, res) => {
    db.query('SELECT * FROM contacts ORDER BY createdAt DESC', (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json(results);
    });
});

// Mark contact as read
app.put('/api/admin/contacts/:id/read', authenticateToken, requireAdmin, (req, res) => {
    db.query('UPDATE contacts SET status = "read" WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Update failed' });
        res.json({ success: true });
    });
});

// Get dashboard stats
app.get('/api/admin/stats', authenticateToken, requireAdmin, (req, res) => {
    Promise.all([
        new Promise((resolve) => db.query('SELECT COUNT(*) as total FROM members', (err, r) => resolve(r?.[0]?.total || 0))),
        new Promise((resolve) => db.query('SELECT COUNT(*) as total FROM payments WHERE status = "pending"', (err, r) => resolve(r?.[0]?.total || 0))),
        new Promise((resolve) => db.query('SELECT SUM(amount) as total FROM payments WHERE status = "completed"', (err, r) => resolve(r?.[0]?.total || 0))),
        new Promise((resolve) => db.query('SELECT COUNT(*) as total FROM contacts WHERE status = "new"', (err, r) => resolve(r?.[0]?.total || 0)))
    ]).then(([totalMembers, pendingPayments, totalRevenue, unreadMessages]) => {
        res.json({ totalMembers, pendingPayments, totalRevenue, unreadMessages });
    });
});

// ============================================
// INSTRUCTOR ROUTES
// ============================================

// Get students by class
app.get('/api/instructor/students', authenticateToken, requireInstructor, (req, res) => {
    const classType = req.query.class;
    let classCondition = '';
    
    if (classType === 'little_tigers') classCondition = 'program = "Little Tigers"';
    else if (classType === 'junior') classCondition = 'program = "Junior Program"';
    else if (classType === 'teen_adult') classCondition = 'program = "Teen/Adult Program"';
    else if (classType === 'family') classCondition = 'program = "Family Classes"';
    
    let query = 'SELECT id, name, email, phone, beltLevel, joinDate, program FROM members WHERE role = "member"';
    if (classCondition) query += ' AND ' + classCondition;
    query += ' ORDER BY name';
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json(results);
    });
});

// Get all students (instructor view)
app.get('/api/instructor/all-students', authenticateToken, requireInstructor, (req, res) => {
    db.query('SELECT id, name, email, phone, beltLevel, program, joinDate FROM members WHERE role = "member" ORDER BY name', (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json(results);
    });
});

// Mark attendance
app.post('/api/instructor/attendance', authenticateToken, requireInstructor, (req, res) => {
    const { studentId, classType, status, date } = req.body;
    
    const attendance = {
        memberId: studentId,
        classDate: date || moment().format('YYYY-MM-DD'),
        classType: classType,
        status: status || 'present'
    };
    
    db.query('INSERT INTO attendance SET ? ON DUPLICATE KEY UPDATE status = ?, notes = ?', 
        [attendance, status, attendance.notes], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to mark attendance' });
        res.json({ success: true, message: 'Attendance recorded' });
    });
});

// Get attendance for a student
app.get('/api/instructor/attendance/:studentId', authenticateToken, requireInstructor, (req, res) => {
    db.query('SELECT * FROM attendance WHERE memberId = ? ORDER BY classDate DESC LIMIT 30', [req.params.studentId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json(results);
    });
});

// Get attendance by class and date
app.get('/api/instructor/attendance-by-class', authenticateToken, requireInstructor, (req, res) => {
    const { classType, date } = req.query;
    const classDate = date || moment().format('YYYY-MM-DD');
    
    db.query(`
        SELECT a.*, m.name, m.beltLevel 
        FROM attendance a 
        JOIN members m ON a.memberId = m.id 
        WHERE a.classType = ? AND a.classDate = ?
    `, [classType, classDate], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error' });
        res.json(results);
    });
});

// Update student belt
app.put('/api/instructor/student/:id/belt', authenticateToken, requireInstructor, (req, res) => {
    const { beltLevel } = req.body;
    db.query('UPDATE members SET beltLevel = ? WHERE id = ?', [beltLevel, req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Update failed' });
        
        // Also update belt_progress
        db.query('UPDATE belt_progress SET currentBelt = ? WHERE memberId = ?', [beltLevel, req.params.id], (err2) => {
            if (err2) console.error('Error updating belt progress:', err2);
        });
        
        res.json({ success: true, message: 'Belt updated successfully' });
    });
});

// Add instructor note for student
app.post('/api/instructor/student/:id/note', authenticateToken, requireInstructor, (req, res) => {
    const { note } = req.body;
    db.query('UPDATE belt_progress SET instructorNotes = ? WHERE memberId = ?', [note, req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to add note' });
        res.json({ success: true, message: 'Note added' });
    });
});

// Get class schedule for instructor
app.get('/api/instructor/schedule', authenticateToken, requireInstructor, (req, res) => {
    const schedule = [
        { day: 'Monday', time: '4:00 PM', class: 'Little Tigers', duration: '45 min' },
        { day: 'Monday', time: '5:00 PM', class: 'Junior Program', duration: '60 min' },
        { day: 'Tuesday', time: '4:00 PM', class: 'Little Tigers', duration: '45 min' },
        { day: 'Tuesday', time: '5:00 PM', class: 'Junior Program', duration: '60 min' },
        { day: 'Wednesday', time: '4:00 PM', class: 'Little Tigers', duration: '45 min' },
        { day: 'Wednesday', time: '5:00 PM', class: 'Junior Program', duration: '60 min' },
        { day: 'Wednesday', time: '6:00 PM', class: 'Teen/Adult', duration: '60 min' },
        { day: 'Thursday', time: '4:00 PM', class: 'Little Tigers', duration: '45 min' },
        { day: 'Thursday', time: '5:00 PM', class: 'Junior Program', duration: '60 min' },
        { day: 'Friday', time: '4:00 PM', class: 'Family Class', duration: '45 min' },
        { day: 'Friday', time: '5:00 PM', class: 'Teen/Adult', duration: '60 min' },
        { day: 'Saturday', time: '10:00 AM', class: 'Little Tigers', duration: '45 min' },
        { day: 'Saturday', time: '11:00 AM', class: 'Junior Program', duration: '60 min' }
    ];
    res.json(schedule);
});

// ============================================
// PAYMENT ROUTES
// ============================================

app.post('/api/payments/jazzcash/initiate', authenticateToken, (req, res) => {
    try {
        const { amount, forMonth } = req.body;
        const memberId = req.user.id;
        const orderId = `TKD${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        const payment = {
            memberId,
            amount,
            paymentMethod: 'jazzcash',
            transactionId: orderId,
            status: 'pending',
            forMonth: forMonth || moment().format('YYYY-MM')
        };
        
        db.query('INSERT INTO payments SET ?', payment, (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Payment creation failed' });
            
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

app.post('/api/payments/easypaisa/initiate', authenticateToken, (req, res) => {
    try {
        const { amount, forMonth } = req.body;
        const memberId = req.user.id;
        const orderId = `EP${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        const payment = {
            memberId,
            amount,
            paymentMethod: 'easypaisa',
            transactionId: orderId,
            status: 'pending',
            forMonth: forMonth || moment().format('YYYY-MM')
        };
        
        db.query('INSERT INTO payments SET ?', payment, (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Payment creation failed' });
            
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

app.post('/api/payments/confirm', authenticateToken, (req, res) => {
    try {
        const { paymentId, transactionId } = req.body;
        
        db.query('UPDATE payments SET status = ?, jazzcashTransactionId = ?, paymentDate = NOW() WHERE id = ? AND memberId = ?',
            ['completed', transactionId, paymentId, req.user.id], (err, result) => {
            if (err) return res.status(500).json({ success: false, message: 'Confirmation failed' });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Payment not found' });
            
            db.query('SELECT email, name FROM members WHERE id = ?', [req.user.id], (err, userResults) => {
                if (!err && userResults.length > 0) {
                    const user = userResults[0];
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
            
            res.json({ success: true, message: 'Payment confirmed successfully' });
        });
    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({ success: false, message: 'Confirmation failed' });
    }
});

app.get('/api/payments/history', authenticateToken, (req, res) => {
    db.query('SELECT * FROM payments WHERE memberId = ? ORDER BY createdAt DESC', [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to fetch payments' });
        res.json({ success: true, payments: results });
    });
});

app.get('/api/member/belt-progress', authenticateToken, (req, res) => {
    db.query('SELECT * FROM belt_progress WHERE memberId = ?', [req.user.id], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to fetch belt progress' });
        
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
    });
});

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
        if (err) return res.status(500).json({ success: false, message: 'Failed to fetch attendance' });
        res.json({ success: true, attendance: results });
    });
});

// ============================================
// SETUP ROUTES
// ============================================

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

app.get('/api/setup-instructor', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash('Instructor@123', 10);
        
        const instructor = {
            name: 'Master Lee',
            email: 'instructor@pathstiger.com',
            password: hashedPassword,
            phone: '0317-4084614',
            role: 'instructor',
            joinDate: moment().format('YYYY-MM-DD'),
            isActive: true
        };
        
        db.query('INSERT INTO members SET ?', instructor, (err) => {
            if (err && err.code === 'ER_DUP_ENTRY') {
                res.json({ message: 'Instructor user already exists' });
            } else if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ message: 'Instructor user created successfully' });
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
    console.log(`👑 Admin setup: http://localhost:${PORT}/api/setup-admin`);
    console.log(`👨‍🏫 Instructor setup: http://localhost:${PORT}/api/setup-instructor`);
});