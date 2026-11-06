-- Job titles: a specialty says what kind of software, so "Senior Backend Software Engineer" (often from
-- "Senior Software Engineer, Backend") is "Senior Backend Engineer". Titles are counted again with the new cleanup.

create or replace function clean_job_title(raw text) returns text
language plpgsql immutable as $$
declare
  t text := coalesce(raw, '');
  parts text[];
  chosen text := null;
  spec text := null;
  i integer;
  acronym text;
begin
  -- Gender notes on European postings: (m/f/d), (m/w/d), (f/m/x).
  t := regexp_replace(t, '\(\s*[mfwdxh]\s*(/\s*[mfwdxh]\s*)+\)', ' ', 'gi');
  -- Requisition numbers: #4521, REQ-123, Job ID: 99.
  t := regexp_replace(t, '#\s*\d[\w-]*', ' ', 'g');
  t := regexp_replace(t, '\m(req|requisition|job\s*id)\M[\s:#-]*[\w-]*\d[\w-]*', ' ', 'gi');
  -- Anything in brackets: a location, a level, a team ("(Remote)", "(P3)", "[Platform]").
  t := regexp_replace(t, '\([^)]*\)|\[[^]]*\]', ' ', 'g');
  -- Emoji and other symbols (C++, C#, .NET and "&" kept).
  t := regexp_replace(t, '[^[:alnum:][:space:]&/+#.,:|–—-]', ' ', 'g');
  -- "Engineer, Senior Software" and "Software Engineer, Senior": the level goes first.
  t := regexp_replace(t, '^\s*([^,|:–—]+?)\s*,\s*(senior|sr\.?|staff|principal|lead|junior|jr\.?)\s*([^,|:–—]*?)\s*$', '\2 \3 \1', 'i');
  -- Team, product or location after a separator: the first part that names a role. A specialty right after
  -- it stays, before the role ("Software Engineer, Backend" is "Backend Software Engineer").
  parts := regexp_split_to_array(t, '\s+[-–—|]\s+|\s*[,|:–—]\s*');
  for i in 1 .. coalesce(array_length(parts, 1), 0) loop
    if chosen is null and job_title_has_role(parts[i]) then
      chosen := parts[i];
      if i < array_length(parts, 1) and parts[i + 1] ~* '^\s*(backend|back[\s-]end|frontend|front[\s-]end|full[\s-]*stack|mobile|ios|android|machine learning|ml|ai|ai\s*/\s*ml|ml\s*/\s*ai|data|infrastructure|security|embedded|cloud|distributed systems)\s*$' then
        spec := trim(parts[i + 1]);
      end if;
    end if;
  end loop;
  t := coalesce(chosen, parts[1], '');
  if spec is not null and position(lower(spec) in lower(t)) = 0 then
    t := regexp_replace(t, '^\s*((senior|sr\.?|staff|principal|lead|junior|jr\.?)\s+)?', '\1' || spec || ' ', 'i');
  end if;

  -- Spellings made one.
  t := regexp_replace(t, '\mfull[\s-]*stack\M', 'Full Stack', 'gi');
  t := regexp_replace(t, '\mfront[\s-]*end\M', 'Frontend', 'gi');
  t := regexp_replace(t, '\mback[\s-]*end\M', 'Backend', 'gi');
  t := regexp_replace(t, '\mdev[\s-]*ops\M', 'DevOps', 'gi');
  t := regexp_replace(t, '\s*&\s*', ' and ', 'g');
  -- Abbreviations spelled out ("SDE 2" loses its level below).
  t := regexp_replace(t, '\msr\M\.?', 'Senior', 'gi');
  t := regexp_replace(t, '\mjr\M\.?', 'Junior', 'gi');
  t := regexp_replace(t, '\m(engr|eng)\M\.?', 'Engineer', 'gi');
  t := regexp_replace(t, '\mmgr\M\.?', 'Manager', 'gi');
  t := regexp_replace(t, '\mdev\M\.?', 'Developer', 'gi');
  t := regexp_replace(t, '\mswe(\s*\d+)?\M', 'Software Engineer', 'gi');
  t := regexp_replace(t, '\msde(\s*\d+)?\M', 'Software Development Engineer', 'gi');
  t := regexp_replace(t, '\m(ai\s*/\s*ml|ml\s*/\s*ai)\M', 'AI/ML', 'gi');
  t := regexp_replace(t, '(^|[^/])\mml\M(?!\s*/)', '\1Machine Learning', 'gi');
  -- A specialty says what kind of software: "Backend Software Engineer" is "Backend Engineer". (Data and
  -- security engineers are their own roles, so "Data Software Engineer" stays.)
  t := regexp_replace(t, '\m(backend|frontend|full stack|mobile|ios|android|infrastructure|platform|embedded|cloud|machine learning|ai/ml|ai|distributed systems)\s+software\s+(engineer|developer)\M', '\1 \2', 'gi');
  -- Level numbers on one company's ladder: II, III, IV, L4, Level 3, P3, a trailing 2 or I.
  t := regexp_replace(t, '\m(ii|iii|iv)\M', ' ', 'gi');
  t := regexp_replace(t, '\m(level\s*\d+|l\d|p\d|ic\d)\M', ' ', 'gi');
  t := regexp_replace(t, '\s+(i|\d)\s*$', '', 'i');
  -- Where and how: remote, hybrid, on-site.
  t := regexp_replace(t, '\m(fully\s+)?(remote|hybrid|on[\s-]?site|in[\s-]office)\M(\s+(us|usa|united states|uk|canada|emea|latam))?', ' ', 'gi');
  -- Contract terms and hiring fluff.
  t := regexp_replace(t, '\m(contract([\s-]to[\s-]hire)?|temporary|temp|full[\s-]?time|part[\s-]?time|\d+[\s-]?months?|urgent(ly)?|now hiring|hiring now|hiring|immediate start)\M', ' ', 'gi');

  -- Spaces and stray punctuation at the ends.
  t := regexp_replace(t, '\s+', ' ', 'g');
  t := regexp_replace(t, '^[\s,:/|–—-]+|[\s,.:/|–—-]+$', '', 'g');
  if t = '' then return ''; end if;

  -- One capitalization: words capitalized, acronyms as they're written.
  t := initcap(lower(t));
  foreach acronym in array array['AI','QA','UI','UX','SRE','SDET','iOS','API','AWS','GCP','LLM','NLP','IT','HR','VP','CTO','CIO','CISO','SAP','ERP','CRM','BI','ETL','SQL','PHP','QE','GTM','SEO','PM','DevOps','ML','.NET','C++','C#','iOS','AR','VR','HPC','RF','PCB'] loop
    t := regexp_replace(t, '(^|[^[:alnum:]])' || regexp_replace(acronym, '([.+#])', '\\\1', 'g') || '($|[^[:alnum:]])', '\1' || acronym || '\2', 'gi');
  end loop;
  t := regexp_replace(t, '\mAnd\M', 'and', 'g');
  t := regexp_replace(t, '\mOf\M', 'of', 'g');
  return t;
end;
$$;

-- Counted again: every saved job's title, cleaned the new way.
truncate job_titles;
insert into job_titles (key, title, postings, last_seen_at, has_role)
select lower(c.cleaned), min(c.cleaned), count(*), max(c.seen), job_title_has_role(min(c.cleaned))
from (select clean_job_title(title) as cleaned, coalesce(posted_at, first_seen_at) as seen from jobs) c
where c.cleaned <> ''
group by lower(c.cleaned);
