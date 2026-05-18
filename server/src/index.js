const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes/api');
const { sequelize } = require('./models');
const { seedIfNeeded } = require('./seed');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.success = (data) => res.json({ success: true, data });
  res.fail = (code, message) => res.status(code).json({ success: false, message });
  next();
});

app.use('/api', apiRouter);

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    success: false,
    message: error.message || '服务异常',
  });
});

async function bootstrap() {
  await sequelize.sync();
  await seedIfNeeded();

  app.listen(port, () => {
    console.log(`Agent workflow server running at http://localhost:${port}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
