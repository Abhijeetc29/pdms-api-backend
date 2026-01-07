const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');  // ✅ ADDED

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',  
  database: 'another_db',
  password: 'abhi@004',
  port: 5432,
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.stack);
  } else {
    console.log('✅ Database connected successfully');
  }
});

// ✅ FIXED LOGIN WITH BCRYPT
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login attempt: ${username}`);
    
    // STEP 1: Find user by username ONLY
    const result = await pool.query(
      `SELECT id, username, password, part_number, "full_name" 
       FROM users WHERE username = $1`,
      [username.trim().toLowerCase()]
    );
    
    // STEP 2: Check if user exists
    if (result.rows.length === 0) {
      console.log(`❌ ${username} not found`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // STEP 3: Verify password against hash
    const isValidPassword = await bcrypt.compare(password.trim(), user.password);
    
    if (!isValidPassword) {
      console.log(`❌ ${username} invalid password`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // STEP 4: Generate token
    const token = `jwt-${user.id}-${Date.now()}`;
    
    console.log(`✅ ${username} logged in successfully (Part: ${user.part_number})`);
    res.json({ 
      user: { 
        id: user.id,
        username: user.username,
        part_number: user.part_number,
        full_name: user.full_name 
      }, 
      token 
    });
    
  } catch (err) {
    console.error('❌ Login error:', err.message);
    res.status(500).json({ message: 'Login server error' });
  }
});

// 🗳️ VOTERS (unchanged)
app.get('/api/voters/:part_number', async (req, res) => {
  try {
    const { part_number } = req.params;
    
    const voters = await pool.query(
      `SELECT 
        id, first_name, last_name, age, gender, epic_number,
        pc_number, pc_name, ac_number, ac_name, part_serial_number,
        part_number, part_name,
        CASE 
          WHEN ac_name IS NOT NULL THEN 'Vidhan Sabha'
          WHEN pc_name IS NOT NULL THEN 'Lok Sabha'  
          WHEN part_name IS NOT NULL THEN 'Municipal'
          ELSE 'Lok Sabha'
        END as election_type,
        false as considered
       FROM voters 
       WHERE part_number = $1 
       ORDER BY first_name, last_name NULLS LAST`, 
      [part_number]
    );
    
    console.log(`📊 Found ${voters.rows.length} voters for ${part_number}`);
    res.json(voters.rows);
  } catch (err) {
    console.error('❌ Voter fetch error:', err);
    res.status(500).json({ message: 'Error fetching voters' });
  }
});

// 🔍 FILTER (unchanged)  
app.get('/api/voters/:part_number/filter/:filter', async (req, res) => {
  try {
    const { part_number, filter } = req.params;
    
    let query = `SELECT 
      id, first_name, last_name, age, gender, epic_number,
      pc_number, pc_name, ac_number, ac_name, part_serial_number,
      part_number, part_name,
      CASE 
        WHEN ac_name IS NOT NULL THEN 'Vidhan Sabha'
        WHEN pc_name IS NOT NULL THEN 'Lok Sabha'
        WHEN part_name IS NOT NULL THEN 'Municipal'
        ELSE 'Lok Sabha'
      END as election_type,
      false as considered
    FROM voters 
    WHERE part_number = $1`;
    
    const params = [part_number];
    
    if (filter !== 'all') {
      if (filter === 'lok_sabha') query += ` AND pc_name IS NOT NULL`;
      if (filter === 'vidhan_sabha') query += ` AND ac_name IS NOT NULL`;
      if (filter === 'municipal') query += ` AND pc_name IS NULL AND ac_name IS NULL`;
    }
    
    query += ` ORDER BY first_name, last_name NULLS LAST`;
    
    const voters = await pool.query(query, params);
    console.log(`📊 Filtered ${voters.rows.length} voters (${filter}) for ${part_number}`);
    res.json(voters.rows);
  } catch (err) {
    console.error('❌ Filter error:', err);
    res.status(500).json([]);
  }
});

// 🗂️ PARTS (unchanged)
app.get('/api/parts', async (req, res) => {
  try {
    const parts = await pool.query(
      `SELECT DISTINCT part_number, part_name, 
        COUNT(*) as voter_count
       FROM voters 
       GROUP BY part_number, part_name 
       ORDER BY part_number`
    );
    console.log(`📊 Parts loaded: ${parts.rows.length}`);
    res.json(parts.rows);
  } catch (err) {
    console.error('❌ Parts fetch error:', err);
    res.status(500).json({ message: 'Error fetching parts' });
  }
});

// 📊 STATISTICS (unchanged)
app.get('/api/stats/:part_number', async (req, res) => {
  try {
    const { part_number } = req.params;
    
    const stats = await pool.query(
      `SELECT 
        COUNT(*) as totalVoters,
        COUNT(CASE WHEN gender = 'Male' THEN 1 END) as maleCount,
        COUNT(CASE WHEN gender = 'Female' THEN 1 END) as femaleCount,
        0 as consideredVotes,
        0 as actualWonVotes
       FROM voters 
       WHERE part_number = $1`,
      [part_number]
    );
    
    console.log(`📈 Stats for ${part_number}:`, stats.rows[0]);
    res.json(stats.rows[0]);
  } catch (err) {
    console.error('❌ Stats error:', err.message);
    res.status(500).json({ 
      totalVoters: 0,
      maleCount: 0,
      femaleCount: 0,
      consideredVotes: 0,
      actualWonVotes: 0
    });
  }
});

// Get upcoming elections
app.get('/api/elections', (req, res) => {
  const query = `
    SELECT id, name, date 
    FROM elections 
    WHERE date >= CURRENT_DATE 
    ORDER BY date ASC
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results.rows);
  });
});

// Get voting place by part number
app.get('/api/voting-place/:part_number', (req, res) => {
  const { part_number } = req.params;
  
  const query = `
    SELECT part_number, polling_station_name, polling_station_address 
    FROM voting_places 
    WHERE part_number = $1
  `;
  
  db.query(query, [part_number], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (results.rows.length === 0) {
      return res.status(404).json({ error: 'Voting place not found' });
    }
    
    res.json(results.rows[0]);
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`🌐 Mobile: http://192.168.1.20:${port}`);
});
