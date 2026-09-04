// Local-row → Supabase-payload mapping, extracted from the sync engine so the
// field coverage is unit-testable (a dropped field here = data that silently
// fails to sync, e.g. the diluent/injection_site class of bug). CommonJS so
// `node --test` can require it; Metro imports it fine.
//
// Note: local uses an INTEGER protocol_id FK; the cloud uses the protocol's
// UUID (protocol_remote_id), which is why child tables remap it here.

// The columns each table is expected to send to the cloud. Kept as data so a
// test can assert the payload never silently drops one.
const CLOUD_FIELDS = {
  protocols: [
    'name', 'compound_id', 'type', 'color', 'amount', 'unit', 'water', 'diluent', 'dose',
    'dose_unit', 'syringe_size', 'concentration', 'concentration_unit',
    'frequency', 'reminder_time', 'interval_days', 'doses_per_day',
    'start_date', 'schedule_total', 'vial_valid_days', 'goal', 'notes', 'note',
    'serving_strength', 'serving_strength_unit', 'serving_units', 'container_units', 'units_taken', 'divisible',
    'active', 'deleted_at',
  ],
  vials: ['protocol_id', 'mixed_on', 'water_ml', 'total_doses', 'doses_taken', 'expires_on', 'active'],
  dose_logs: ['protocol_id', 'outcome', 'injection_site', 'logged_at'],
  biomarkers: ['report_date', 'marker', 'value', 'unit'],
  vaccines: ['name', 'date_given', 'next_due', 'notes', 'manufacturer', 'batch_lot', 'dose_number', 'provider', 'location'],
};

function toCloudPayload(table, row) {
  const base = {};

  if (table === 'protocols') {
    base.name = row.name;
    base.compound_id = row.compound_id;
    base.type = row.type;
    base.color = row.color;
    base.amount = row.amount;
    base.unit = row.unit;
    base.water = row.water;
    base.diluent = row.diluent;
    base.dose = row.dose;
    base.dose_unit = row.dose_unit;
    base.syringe_size = row.syringe_size;
    base.concentration = row.concentration;
    base.concentration_unit = row.concentration_unit;
    base.frequency = row.frequency;
    base.reminder_time = row.reminder_time;
    base.interval_days = row.interval_days;
    base.doses_per_day = row.doses_per_day;
    base.start_date = row.start_date;
    base.schedule_total = row.schedule_total;
    base.vial_valid_days = row.vial_valid_days;
    base.goal = row.goal;
    base.notes = row.notes;
    base.note = row.note;
    base.serving_strength = row.serving_strength;
    base.serving_strength_unit = row.serving_strength_unit;
    base.serving_units = row.serving_units;
    base.container_units = row.container_units;
    base.units_taken = row.units_taken ?? 0; // never push NULL (Postgres default 0 only applies on omit)
    base.divisible = row.divisible == null ? null : row.divisible === 1;
    base.active = row.active === 1;
    base.deleted_at = row.deleted_at;
  } else if (table === 'vials') {
    base.protocol_id = row.protocol_remote_id;
    base.mixed_on = row.mixed_on;
    base.water_ml = row.water_ml;
    base.total_doses = row.total_doses;
    base.doses_taken = row.doses_taken;
    base.expires_on = row.expires_on;
    base.active = row.active === 1;
  } else if (table === 'dose_logs') {
    base.protocol_id = row.protocol_remote_id;
    base.outcome = row.outcome;
    base.injection_site = row.injection_site;
    base.logged_at = row.logged_at;
  } else if (table === 'biomarkers') {
    base.report_date = row.report_date;
    base.marker = row.marker;
    base.value = row.value;
    base.unit = row.unit;
  } else if (table === 'vaccines') {
    base.name = row.name;
    base.date_given = row.date_given;
    base.next_due = row.next_due;
    base.notes = row.notes;
    base.manufacturer = row.manufacturer;
    base.batch_lot = row.batch_lot;
    base.dose_number = row.dose_number;
    base.provider = row.provider;
    base.location = row.location;
  }

  return base;
}

module.exports = { toCloudPayload, CLOUD_FIELDS };
