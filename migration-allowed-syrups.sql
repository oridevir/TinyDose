-- סירופים מותרים לכל המלצה (2026-10-26). ריק = כל הסירופים של התרופה.
-- הורץ במאגר 2026-10-26, יחד עם מילוי ראשוני לפי DAG לאוגמנטין.
alter table public.recommendations add column if not exists allowed_product_ids uuid[];
comment on column public.recommendations.allowed_product_ids is 'Syrups offered for this option (null = all syrups of the drug)';

-- מילוי ראשוני: אוטיטיס + ריאות = אוגמנטין ES; ציסטיטיס + פיילונפריטיס = אוגמנטין 400 (7:1); נשיכה = הכול
with es as (select id from products where brand_name='אוגמנטין ES'),
 a400 as (select id from products where brand_name='אוגמנטין' and conc_mg=400),
 aug as (select id from drugs where name_he='אמוקסיצילין-קלבולנט')
update recommendations r set allowed_product_ids = case
   when i.name_he in ('אוטיטיס מדיה','דלקת ריאות') then array[(select id from es)]
   when i.name_he in ('ציסטיטיס','פיילונפריטיס') then array[(select id from a400)] end
from indications i where i.id=r.indication_id and r.drug_id=(select id from aug)
  and i.name_he in ('אוטיטיס מדיה','דלקת ריאות','ציסטיטיס','פיילונפריטיס');
