const admin = db.getSiblingDB('admin');
const setName = 'rs0';
const memberHost = 'mongo:27017';

function isMongoErrorCode(error, code) {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === code;
}

function verifyConfiguration() {
  const configResult = admin.runCommand({ replSetGetConfig: 1 });
  if (configResult.ok !== 1) throw new Error('Could not read the MongoDB replica-set config');
  const config = configResult.config;
  if (
    !config ||
    config._id !== setName ||
    !Array.isArray(config.members) ||
    config.members.length !== 1 ||
    config.members[0].host !== memberHost
  ) {
    throw new Error('MongoDB already has a different replica-set configuration');
  }
}

let needsInitialization = false;
try {
  admin.runCommand({ replSetGetStatus: 1 });
} catch (error) {
  if (!isMongoErrorCode(error, 94)) throw error;
  needsInitialization = true;
}

if (needsInitialization) {
  try {
    admin.runCommand({
      replSetInitiate: {
        _id: setName,
        members: [{ _id: 0, host: memberHost }],
      },
    });
  } catch (error) {
    if (!isMongoErrorCode(error, 23)) throw error;
  }
}

verifyConfiguration();

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  const hello = admin.runCommand({ hello: 1 });
  if (hello.setName && hello.setName !== setName) {
    throw new Error('MongoDB is a member of an unexpected replica set');
  }
  if (hello.setName === setName) {
    verifyConfiguration();
    if (hello.isWritablePrimary) {
      print('MongoDB single-node replica set is ready.');
      quit(0);
    }
  }
  sleep(250);
}

throw new Error('MongoDB replica set did not become primary before the setup timeout');
