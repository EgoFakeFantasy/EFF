"use strict";
// Shared isolated harness; preserve legacy CLI source/destination/guard/opponent/hash.
if(process.argv.length!==7)throw Error("PIG2_EXPECTED_HASH_REQUIRED");
process.argv.push("pig2");
require("./foreign-sword-native-test.cjs");
