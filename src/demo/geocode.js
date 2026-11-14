// Demo address lookup: recognizes well-known street and place names so a
// typed address lands in a zone without any outside service. (The real
// build uses the free US Census geocoder.)
import { center } from "./seed";

const WORDS = [
  ["fort-benning", /benning|fort moore|main gate|on base/i],
  ["phenix-city", /phenix|phoenix city|\bAL\b|alabama|crawford rd|opelika/i],
  ["airport", /airport|\bCSG\b/i],
  ["peachtree", /peachtree|manchester exp/i],
  ["midland", /midland|flat rock|warm springs rd/i],
  ["beallwood", /beallwood|veterans p/i],
  ["north-highland", /north highland|2nd ave|second ave/i],
  ["rose-hill", /rose hill|hamilton rd|talbotton|cherokee/i],
  ["east-wynnton", /east wynnton|buena vista/i],
  ["wynnton", /wynnton|macon rd|13th st/i],
  ["baker", /baker|victory dr|south lumpkin/i],
  ["the-park", /cusseta|the park|co-?op/i],
  ["east", /\beast\b|milgen|university ave/i],
  ["downtown", /downtown|broadway|front ave|1st ave|riverwalk|civic center|hospital|courthouse/i],
];

export async function geocode(address) {
  const text = String(address || "");
  if (!text.trim()) return null;
  const hit = WORDS.find(([, re]) => re.test(text));
  return hit ? { ...center(hit[0]), matched: text } : null;
}
export default { geocode };
