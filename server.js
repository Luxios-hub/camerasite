const { createApp } = require('./src/app');
const { env } = require('./src/config/env');

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`CamerasNYC backend listening at http://localhost:${env.PORT}`);
});
