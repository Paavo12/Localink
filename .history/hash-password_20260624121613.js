const bcrypt = require('bcrypt');

const password = '%De12Ameida987Teopilina!@#';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) throw err;
  console.log('Hashed password:', hash);
});
teopolina12dealmeida@localink.com

