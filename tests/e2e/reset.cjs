// Wipe the emulator database so each suite starts clean.
module.exports = async function reset(db) {
  const cols = await db.listCollections();
  await Promise.all(cols.map((c) => db.recursiveDelete(c)));
};
