import { config } from '../config.js';
import { query } from '../db.js';

// There is no login: every request acts as the seeded demo user, looked up by
// email (its id is not assumed).
export async function currentUser(req, res, next) {
  const { rows } = await query(
    'SELECT user_id, name, email FROM app_user WHERE email = $1',
    [config.demoUserEmail],
  );
  if (!rows[0]) throw new Error(`Demo user ${config.demoUserEmail} not found. Run "npm run migrate".`);
  req.user = rows[0];
  next();
}
