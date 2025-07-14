-- Modify product_schedules table to add foreign key constraint
ALTER TABLE product_schedules
    ADD CONSTRAINT fk_account_name
    FOREIGN KEY (account_name)
    REFERENCES accounts(name)
    ON DELETE CASCADE; -- If an account is deleted, delete all its schedules 