import { Hono } from 'hono';
import cdn from './routes/cdn';

const app = new Hono();

// Routes
app.route('/cdn', cdn);
app.get('/health', (c) => c.text('ok'));

export default app;
