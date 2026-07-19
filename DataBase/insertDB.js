const pool = require('../db');

const insertTables = async () => {
  try {


    // Insert data into Brands table
    await pool.query(`
      INSERT INTO Brands (BrandName) VALUES
        ('Aldo'),
        ('Crocs'),
        ('Skechers'),
        ('Tommy Hilfiger'),
        ('Nine West'),
        ('R&B'),
        ('Beverly Hills Polo Club'),
        ('Tim Hortons'),
        ('Cold Stone Creamery'),
        ('Daiso Japan');
    `);

    await pool.query(`
        INSERT INTO Locations (LocationName) VALUES
            ('Manama'),
            ('Seef'),
            ('Marasi'),
            ('Muharraq'),
            ('Juffair'),
            ('Riffa');   
    `);


    await pool.query(`
        INSERT INTO MajorCriteria (MajorCriteriaName) VALUES
            ('Store Standards'),
            ('Customer Service'),
            ('Cash Management'),
            ('Stock Management'),
            ('Visual Merchandising'),
            ('Health & Safety'),
            ('Back Store'),
            ('Staff Grooming');
    `);


    await pool.query(`
        INSERT INTO AuditPoints
        (MajorCriteriaID, auditComment, subPointCriteria, weightage, riskMatrix)
        VALUES
            (1, 'Store entrance is clean.', 'Entrance', 5, 'Low'),
            (1, 'Promotional materials are displayed correctly.', 'Promotion Display', 5, 'Moderate'),
            (2, 'Customers are greeted within 30 seconds.', 'Customer Greeting', 10, 'High'),
            (2, 'Staff maintains positive body language.', 'Customer Interaction', 5, 'Moderate'),
            (3, 'Cash drawer matches system balance.', 'Cash Reconciliation', 20, 'High'),
            (3, 'Safe key is secured.', 'Safe Security', 10, 'High'),
            (4, 'Stock is arranged correctly in stock room.', 'Stock Room', 10, 'Moderate'),
            (4, 'Damaged items are segregated.', 'Damaged Stock', 5, 'Moderate'),
            (5, 'Mannequins follow current VM guidelines.', 'Mannequins', 10, 'Low'),
            (6, 'Fire extinguisher inspection is valid.', 'Fire Safety', 15, 'High'),
            (6, 'Emergency exit is accessible.', 'Emergency Exit', 10, 'High'),
            (7, 'Back store is clean and organized.', 'Back Store Cleanliness', 5, 'Low'),
            (8, 'Staff uniform complies with company policy.', 'Uniform', 5, 'Low');
    `);



console.log(`Tables checked/Inserted successfully in database: ${process.env.DB_NAME} ✅✅`);
} catch (err) {
    console.error('Error inserting into tables:', err);
} finally {
    await pool.end();
}

};

insertTables();


// To run this script, use the following command in your terminal:
// node ./DataBase/insertDB.js