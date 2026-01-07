const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcrypt');

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

// ✅ LOGIN (unchanged)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔐 Login attempt: ${username}`);
    
    const result = await pool.query(
      `SELECT id, username, password, part_number, "full_name" 
       FROM users WHERE username = $1`,
      [username.trim().toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      console.log(`❌ ${username} not found`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password.trim(), user.password);
    
    if (!isValidPassword) {
      console.log(`❌ ${username} invalid password`);
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
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

// ✅ ELECTIONS (unchanged)
app.get('/api/elections', async (req, res) => {
  try {
    const elections = await pool.query(
      `SELECT id, name, election_date as date 
       FROM upcoming_elections 
       WHERE is_active = true AND election_date >= CURRENT_DATE
       ORDER BY election_date ASC
       LIMIT 2`
    );
    res.json(elections.rows);
  } catch (err) {
    console.error('❌ Elections fetch error:', err);
    res.status(500).json([]);
  }
});

// ✅ POLLING STATION (unchanged)
app.get('/api/polling-station/:part_number', async (req, res) => {
  try {
    const { part_number } = req.params;
    const station = await pool.query(
      `SELECT part_number, 
              station_name as polling_station_name, 
              station_address as polling_station_address
       FROM polling_stations 
       WHERE part_number = $1 AND is_active = true
       LIMIT 1`,
      [part_number]
    );
    res.json(station.rows[0] || null);
  } catch (err) {
    console.error('❌ Polling station error:', err);
    res.status(500).json(null);
  }
});

// ✅ FIXED VOTERS - Returns REAL considered status from DB
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
        considered  -- ✅ REAL from database now
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

// ✅ FIXED FILTER (unchanged logic, real considered)
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
      considered  -- ✅ REAL from database
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

// ✅ FIXED STATS - Uses REAL considered count from DB
app.get('/api/stats/:part_number', async (req, res) => {
  try {
    const { part_number } = req.params;
    
    const stats = await pool.query(
      `SELECT 
        COUNT(*) as totalVoters,
        COUNT(CASE WHEN gender = 'Male' THEN 1 END) as maleCount,
        COUNT(CASE WHEN gender = 'Female' THEN 1 END) as femaleCount,
        COUNT(CASE WHEN considered = true THEN 1 END) as consideredVotes,  -- ✅ REAL
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

// ✅ NEW: Toggle voter considered status (PERSISTENT)
app.put('/api/voters/:id/considered', async (req, res) => {
  try {
    const { id } = req.params;
    const { considered } = req.body;
    
    const result = await pool.query(
      'UPDATE voters SET considered = $1 WHERE id = $2 RETURNING id',
      [considered, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Voter not found' });
    }
    
    console.log(`✅ Voter ${id} considered = ${considered}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ GENDER UPDATE (unchanged)
app.put('/api/voters/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { gender } = req.body;
    
    const result = await pool.query(
      'UPDATE voters SET gender = $1 WHERE id = $2 RETURNING id',
      [gender, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Voter not found' });
    }
    
    console.log(`✅ Voter ${id} gender = ${gender}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Gender update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ PARTS (unchanged)
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

app.listen(port, () => {
  console.log(`🚀 Server running on http://192.168.1.12:${port}`);
  console.log(`🌐 Mobile: http://192.168.1.12:${port}`);
});
