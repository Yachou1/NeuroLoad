// Conservative local signals, not an official-domain registry or authentication detector.
const within=(host,root)=>host===root || host.endsWith('.'+root);
const governmentRoots=['belgium.be','service-public.fr','ameli.fr','urssaf.fr','admin.ch','europa.eu','government.nl','overheid.nl','guichet.lu','public.lu','vlaanderen.be','wallonie.be'];
export function classifySite(raw) {
  let host;
  try{host=new URL(raw).hostname.toLowerCase();}catch{return null;}
  if(/(?:^|\.)(?:gov|gouv|fgov|gob|government|overheid)(?:\.|$)/.test(host) || /(?:^|\.)go\.[a-z]{2}$/.test(host) || governmentRoots.some(root=>within(host,root)))return {category:'government',label:'Government or public service'};
  if(/(?:bank|banque|banc[ao]|paypal|stripe|revolut|wise|wallet|impots|tax|assurance|insurance)/.test(host))return {category:'finance',label:'Banking, payments or insurance'};
  if(/(?:hospital|medical|sante|health|mutuelle)/.test(host))return {category:'health',label:'Health or personal data'};
  if(/(?:gmail|outlook|proton|webmail)/.test(host) || /(?:^|\.)(?:mail|inbox|messages)(?:\.|$)/.test(host))return {category:'mail',label:'Mail'};
  if(/(?:^|\.)(?:auth|oauth|sso|login|account|accounts|admin|private|secure|token|session)(?:\.|$)/.test(host))return {category:'private',label:'Private area or authentication'};
  if(host.split('.').some(part=>part.startsWith('xn--')))return {category:'review',label:'Domain name requiring review'};
  return null;
}
export const hardPrivateHost=host=>/(?:^|[\W_])(?:auth|oauth|sso|log[io]n|log[io]ut|sign[io]n|signout|signup|register|account|accounts|profile|settings|admin|dashboard|checkout|cart|basket|payment|pay|billing|invoice|patient|api|graphql|wp-admin|wp-json|private|secret|secure|token|session|mail|webmail|inbox|messages|delete|remove|unsubscribe|download|connexion|deconnexion|compte|paiement|panier|facture|messagerie|giris|cikis|hesap|odeme|sepet|sifre)(?:$|[\W_])/i.test(host) || /(?:gmail|outlook|proton)/i.test(host);
