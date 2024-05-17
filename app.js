const express = require("express");
const bodyParser = require("body-parser");
const { Pool } = require("pg");

const app = express();

// PostgreSQL connection pool setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware to parse JSON bodies
app.use(bodyParser.json());

app.get("/api/account/:accountNumber", async (req, res) => {
  const { accountNumber } = req.params;
  try {
    const result = await db.query(
      "SELECT * FROM accounts WHERE account_number = $1",
      [accountNumber]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/withdraw", async (req, res) => {
  const { accountNumber, amount } = req.body;
  if (amount % 5 !== 0) {
    return res
      .status(400)
      .json({ error: "Withdrawal amount must be in multiples of $5" });
  }
  if (amount > 200) {
    return res.status(400).json({
      error: "Cannot withdraw more than $200 in a single transaction",
    });
  }

  try {
    // Check total withdrawals today
    const withdrawalsToday = await pool.query(
      `SELECT SUM(amount) as total FROM transactions WHERE account_number = $1 AND type = 'withdrawal' AND DATE(date) = CURRENT_DATE`,
      [accountNumber]
    );

    const totalToday = withdrawalsToday.rows[0].total || 0;
    if (totalToday + amount > 400) {
      pool.release();
      return res
        .status(400)
        .json({ error: "Cannot withdraw more than $400 in a single day" });
    }

    // Check current balance
    const result = await pool.query(
      "SELECT amount, type, credit_limit FROM accounts WHERE account_number = $1",
      [accountNumber]
    );
    if (result.rows.length === 0) {
      pool.release();
      return res.status(404).json({ error: "Account not found" });
    }

    const account = result.rows[0];
    if (account.type !== "credit" && account.amount < amount) {
      pool.release();
      return res.status(400).json({ error: "Insufficient funds" });
    }
    if (
      account.type === "credit" &&
      account.amount - amount < -account.credit_limit
    ) {
      pool.release();
      return res.status(400).json({ error: "Credit limit exceeded" });
    }

    // Perform withdrawal
    await pool.query("BEGIN");
    await pool.query(
      "UPDATE accounts SET amount = amount - $1 WHERE account_number = $2",
      [amount, accountNumber]
    );
    await pool.query(
      "INSERT INTO transactions (account_number, type, amount, date) VALUES ($1, $2, $3, NOW())",
      [accountNumber, "withdrawal", amount]
    );
    await pool.query("COMMIT");

    pool.release();
    res.json({
      message: "Withdrawal successful",
      balance: account.amount - amount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/deposit", async (req, res) => {
  const { accountNumber, amount } = req.body;
  if (amount > 1000) {
    return res.status(400).json({
      error: "Cannot deposit more than $1000 in a single transaction",
    });
  }

  try {
    const accountResult = await pool.query(
      "SELECT amount, type, credit_limit FROM accounts WHERE account_number = $1",
      [accountNumber]
    );
    if (accountResult.rows.length === 0) {
      pool.release();
      return res.status(404).json({ error: "Account not found" });
    }

    const account = accountResult.rows[0];
    if (account.type === "credit" && amount > -account.amount) {
      pool.release();
      return res
        .status(400)
        .json({ error: "Deposit would exceed credit repayment needs" });
    }

    // Perform deposit
    await pool.query("BEGIN");
    await pool.query(
      "UPDATE accounts SET amount = amount + $1 WHERE account_number = $2",
      [amount, accountNumber]
    );
    await pool.query(
      "INSERT INTO transactions (account_number, type, amount, date) VALUES ($1, $2, $3, NOW())",
      [accountNumber, "deposit", amount]
    );
    await pool.query("COMMIT");

    pool.release();
    res.json({
      message: "Deposit successful",
      balance: account.amount + amount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(3001, () => console.log("Server running on port 3001"));
