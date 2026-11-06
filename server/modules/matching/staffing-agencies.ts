// Staffing agencies, recruiters and job aggregators: they post other companies' jobs (common on LinkedIn Easy
// Apply), so applying puts a middleman between you and the employer, and often hides who the employer is.
// Known names, plus words in a name that say what it is ("Prestige Staffing", "Recruiting from Scratch").
import { normalize } from "@/shared/text";

/** Known agencies, recruiters and aggregators, by name (compared with case and punctuation ignored). */
const KNOWN = [
  // Staffing and IT consulting firms
  "Robert Half", "CyberCoders", "Mindlance", "Brooksource", "Intelletec", "Jobot", "Insight Global", "TEKsystems",
  "Randstad", "Adecco", "Kforce", "Apex Systems", "Actalent", "Aerotek", "Akkodis", "Modis", "Experis", "Manpower",
  "ManpowerGroup", "Kelly", "Kelly Services", "Collabera", "Diverse Lynx", "Infojini", "Beacon Hill", "Vaco",
  "Creative Circle", "LHH", "Hays", "Michael Page", "Robert Walters", "Harnham", "Storm2", "Talently", "Lancesoft",
  "Russell Tobin", "Addison Group", "Judge Group", "The Judge Group", "Signature Consultants", "Motion Recruitment",
  "Jefferson Frank", "Nigel Frank International", "Mason Frank International", "Oscar", "Hirewell", "Atrium",
  "System One", "Yoh", "Volt", "Allegis Group", "Cognizant Staffing", "Synergis", "BCforward", "Ampcus", "Tential",
  "Optomi", "Genesis10", "Hire Velocity", "Revature", "Crossover", "Turing", "Toptal", "Andela", "Gun io",
  // Recruiting firms named for what they place
  "People In AI", "Recruiting from Scratch", "Blue Signal Search", "Aspiron Search", "Staffing Lab", "Prestige Staffing",
  // Job aggregators that repost other companies' jobs
  "Jobgether", "Lensa", "Jooble", "Talent com", "Jobs via Dice", "Dice", "Jobs via eFinancialCareers", "Wiraa",
  "Hiring Cafe", "Hirebase", "Remote Rocketship", "Haystack", "Underdog io", "Hired", "Jobright ai", "Jobright",
].map(normalize);
const KNOWN_SET = new Set(KNOWN);

/** Words in a name that say it places people rather than employs them. */
const SAYS_SO = /\b(staffing|recruiting|recruitment|recruiters|headhunters?|talent (partners|solutions|acquisition partners)|placement( services)?|executive search|search (group|partners|firm))\b|\bsearch$/;

/**
 * Whether a company is a staffing agency, recruiter or job aggregator rather than the employer.
 *
 * @returns The name as given when it is, else null.
 */
export function staffingAgency(company: string): string | null {
  const name = normalize(company);
  if (!name) return null;
  return KNOWN_SET.has(name) || SAYS_SO.test(name) ? company : null;
}
