const express = require('express');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const PORT = process.env.PORT || 3000;

// קבצים סטטיים מתוך public
app.use(express.static(path.join(__dirname, 'public')));

// דיפולט לכל route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});
const app = express();
const db = new sqlite3.Database('./data.sqlite1');
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secret-key', resave: false, saveUninitialized: true }));
app.use(express.static('public'));


// נתיב שמחזיר פרטי משתמש מתוך ה-session
app.get('/me', (req, res) => {
    if (req.session && req.session.user) {
        res.json({
            id: req.session.user.id,
            username: req.session.user.username,
            role: req.session.user.role
        });
    } else {
        res.status(401).json({ error: 'לא מחובר' });
    }
});


// נתיב לקבלת דיירים לפי פרויקט וכתובת (בניין)
app.get('/residents-by-building', (req, res) => {
    const project = req.query.project;
    const address = req.query.address;

    if (!project || !address) {
        return res.status(400).json({ error: 'Missing project or address parameter' });
    }

    const sql = `SELECT * FROM residents WHERE project = ? AND address = ?`;
    db.all(sql, [project, address], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json(rows);
    });
});


app.post('/update-status', express.json(), (req, res) => {
    const { id, status, note } = req.body;
    if (!id || !status) return res.status(400).send('Missing parameters');

    const updatedAt = new Date().toISOString();
    db.run('UPDATE residents SET status = ?, note = ?, updated_at = ? WHERE id = ?', [status, note, updatedAt, id], err => {
        if (err) {
            console.error(err);
            return res.status(500).send('DB Error');
        }
        res.send('עודכן');
    });
});




// 🔧 Initialize DB
function initDB() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS residents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project TEXT,
            address TEXT,
            apartment TEXT,
            name TEXT,
            id_number TEXT,
            phone TEXT,
            status TEXT DEFAULT 'טרם טופל',
            note TEXT,
            updated_at TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS user_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            project TEXT,
            address TEXT,
            UNIQUE(user_id, project, address)
        )`);

        // יצירת משתמשים ברירת מחדל עם הצפנת סיסמה
        const defaultUsers = [
            { username: 'ניסים_מנהל', password: 'ניסים עשור', role: 'admin' },
            { username: 'אליהו_מנהל', password: 'אליהו אללוף', role: 'admin' },
            { username: 'ניסים עשור', password: 'ניסים עשור', role: 'user' },
            { username: 'אליהו אללוף', password: 'אליהו אללוף', role: 'user' },
        ];

        defaultUsers.forEach(u => {
            bcrypt.hash(u.password, 12).then(hashed => {
                db.run('INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)', [u.username, hashed, u.role]);
            });
        });
    });
}

initDB();

// 🔑 Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send('Missing username or password');

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error(err);
            return res.status(500).send('DB Error');
        }
        if (!user) return res.status(401).send('Unauthorized');

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).send('Unauthorized');

        req.session.user = { id: user.id, username: user.username, role: user.role };
        res.redirect(user.role === 'admin' ? '/admin.html' : '/user.html');
    });
});

// ➕ נתיב חדש להחזרת הפרויקטים והבניינים של המשתמש המחובר
app.get('/my-buildings', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.session.user.id;

    const sql = `
        SELECT up.project, up.address
        FROM user_projects up
        WHERE up.user_id = ?
    `;

    db.all(sql, [userId], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json(rows); // מחזיר מערך של { project, address }
    });
});

// 📤 Upload Excel
app.post('/upload', upload.single('file'), (req, res) => {
    const { project } = req.body;
    if (!project || !req.file) return res.status(400).send('Missing project or file');

    try {
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const stmt = db.prepare(`INSERT INTO residents (project, address, apartment, name, id_number, phone) VALUES (?, ?, ?, ?, ?, ?)`);
        data.forEach(row => {
            stmt.run([project, row.כתובת, row.מספר_דירה, row.שם, row.תז, row.פלאפון]);
        });
        stmt.finalize();

        fs.unlinkSync(req.file.path);
        res.send('הקובץ הועלה');
    } catch (e) {
        console.error(e);
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(500).send('Error processing file');
    }
});

// 📊 Get project status
app.get('/project/:name', (req, res) => {
    const { name } = req.params;
    db.all('SELECT status, COUNT(*) as count FROM residents WHERE project = ? GROUP BY status', [name], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('DB Error');
        }
        res.json(rows);
    });
});

// 📋 Get residents by status
app.get('/residents/:project/:status', (req, res) => {
    const { project, status } = req.params;
    db.all('SELECT * FROM residents WHERE project = ? AND status = ?', [project, status], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('DB Error');
        }
        res.json(rows);
    });
});

// 📝 Update status and note for resident
app.post('/update-status', (req, res) => {
    const { id, status, note } = req.body;
    if (!id || !status) return res.status(400).send('Missing parameters');

    const updatedAt = new Date().toISOString();
    db.run('UPDATE residents SET status = ?, note = ?, updated_at = ? WHERE id = ?', [status, note, updatedAt, id], err => {
        if (err) {
            console.error(err);
            return res.status(500).send('DB Error');
        }
        res.send('עודכן');
    });
});

// 👥 Get users
app.get('/users', (req, res) => {
    db.all('SELECT id, username, role FROM users', [], (err, users) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json(users);
    });
});

// 🧑‍💻 Update user password
app.post('/update-user', (req, res) => {
    const { id, password } = req.body;
    if (!id || !password) return res.status(400).send('Missing parameters');

    bcrypt.hash(password, 12).then(hash => {
        db.run('UPDATE users SET password = ? WHERE id = ?', [hash, id], err => {
            if (err) {
                console.error(err);
                return res.status(500).send('DB Error');
            }
            res.send('סיסמה עודכנה');
        });
    });
});

// 🗑️ Delete user
app.post('/delete-user', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).send('Missing user id');

    db.run('DELETE FROM users WHERE id = ?', [id], err => {
        if (err) {
            console.error(err);
            return res.status(500).send('DB Error');
        }
        res.send('המשתמש נמחק');
    });
});

// 📊 Get all projects with total residents count
app.get('/all-projects', (req, res) => {
    db.all('SELECT project, COUNT(*) as total FROM residents GROUP BY project', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json(rows);
    });
});

// 📋 Get all unique project names
app.get('/all-project-names', (req, res) => {
    db.all('SELECT DISTINCT project FROM residents', [], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json(rows.map(r => r.project));
    });
});

// 🏢 Get all buildings (addresses) in a project
app.get('/buildings/:project', (req, res) => {
    const { project } = req.params;
    db.all('SELECT DISTINCT address FROM residents WHERE project = ?', [project], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json(rows.map(r => r.address));
    });
});

// 📋 Get buildings + users assigned for a project
app.get('/buildings-users/:project', (req, res) => {
    const project = req.params.project;

    db.all(`SELECT DISTINCT address FROM residents WHERE project = ?`, [project], (err, buildings) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }

        db.all(`SELECT up.address, u.id as userId, u.username FROM user_projects up
            JOIN users u ON up.user_id = u.id
            WHERE up.project = ?`, [project], (err2, assignments) => {
            if (err2) {
                console.error(err2);
                return res.status(500).json({ error: 'DB Error' });
            }

            const buildingUsersMap = {};
            assignments.forEach(a => {
                if (!buildingUsersMap[a.address]) buildingUsersMap[a.address] = [];
                buildingUsersMap[a.address].push({ id: a.userId, username: a.username });
            });

            const response = buildings.map(b => ({
                address: b.address || b,
                users: buildingUsersMap[b.address || b] || []
            }));

            res.json(response);
        });
    });
});

// 🔗 Assign user to project + building (address)
app.post('/assign-project', (req, res) => {
    const { userId, project, address } = req.body;
    if (!userId || !project || !address) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    db.run(
        `INSERT OR IGNORE INTO user_projects (user_id, project, address) VALUES (?, ?, ?)`,
        [userId, project, address],
        err => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'DB Error' });
            }
            res.json({ success: true });
        }
    );
});

// ❌ Remove user assignment from building
app.post('/remove-user-building', (req, res) => {
    const { userId, project, address } = req.body;
    if (!userId || !project || !address) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    db.run(`DELETE FROM user_projects WHERE user_id = ? AND project = ? AND address = ?`, [userId, project, address], err => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json({ success: true });
    });
});

// ➕ Add new user
app.post('/add-user', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).send('נא למלא את כל השדות');
    }
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).send('שגיאת מסד נתונים');
        }
        if (row) return res.status(400).send('משתמש קיים');

        bcrypt.hash(password, 12).then(hash => {
            db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hash, role], err2 => {
                if (err2) {
                    console.error(err2);
                    return res.status(500).send('שגיאת מסד נתונים');
                }
                res.send('משתמש נוסף בהצלחה');
            });
        });
    });
});

// נתיב לקבלת בניינים שהמשתמש משויך אליהם (עם userId שנשלח)
app.get('/user-buildings/:userId', (req, res) => {
    const userId = req.params.userId;

    const sql = `
    SELECT up.project, up.address
    FROM user_projects up
    WHERE up.user_id = ?
  `;

    db.all(sql, [userId], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        res.json(rows); // מחזיר מערך של { project, address }
    });
});



app.listen(3000, () => console.log('Server running on http://localhost:3000'));
