-- Review the mappings with Hotel Yuli's accountant before running this migration.
update expenses
set category = case
  when category in ('Planilla', 'Henrry') then 'Payroll'
  when category = 'CCSS' then 'Employment taxes and CCSS'
  when category in ('Professional Services') then 'Contractors and professional services'
  when category in ('Electric', 'Water', 'Gas', 'Internet', 'Telephone', 'Strauss Water') then 'Utilities'
  when category = 'Limpieza - Servicios Profesionales' then 'Cleaning and housekeeping'
  when category in ('HR Suplidora', 'Breakfast to go', 'Walmart / Varianza Pequeño') then 'Guest and breakfast supplies'
  when category = 'Pool Maintenance' then 'Pool and garden maintenance'
  when category in ('AC Maintenance', 'NOVEX', 'Ferretería Palmares', 'Ferretería EPA S.A.', 'El Colono', 'Ferretería Iguana Verde', 'Maintenance and Repairs') then 'Maintenance and repairs'
  when category = 'Servicios Sanitarios JS' then 'Waste and sanitation'
  when category = 'Parqueo' then 'Parking and transportation'
  when category = 'Accountant' then 'Accounting and legal'
  when category = 'MNK Seguros' then 'Insurance'
  when category in ('OSA', 'Hacienda - Renta') then 'Taxes, permits and municipal fees'
  when category in ('Google LLC', 'Hotel Competence LLC') then 'Software and subscriptions'
  when category = 'Google Ads' then 'Marketing and advertising'
  when category in ('Booking', 'Unique') then 'OTA commissions'
  when category in ('Comision del Datafono', 'Comision por Transaccion') then 'Bank and card fees'
  when category in ('Flights', 'Daily Expenses', 'Rental Car', 'Travel Expenses') then 'Travel expenses'
  else 'Other expenses'
end
where category is not null;
