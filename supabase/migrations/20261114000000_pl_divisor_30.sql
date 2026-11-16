-- PL per-day rate is Salary base / 30 (was 26). Updates the published PL rule so Admin > Calculator Management shows the same.
update calculator_rule_versions
set config = config || '{"divisor_options":[30],"default_divisor":30}'::jsonb
where calculator = 'pl' and status = 'published';
