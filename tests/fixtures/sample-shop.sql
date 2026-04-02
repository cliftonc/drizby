CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  price NUMERIC(10,2) NOT NULL,
  rating NUMERIC(3,2) DEFAULT 0
);
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  total NUMERIC(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  customer_id INTEGER REFERENCES customers(id),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  body TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
INSERT INTO customers (name, email, city, state, created_at) VALUES
  ('Alice Johnson', 'alice@example.com', 'New York', 'NY', '2024-01-15'),
  ('Bob Smith', 'bob@example.com', 'Los Angeles', 'CA', '2024-02-01'),
  ('Carol Davis', 'carol@example.com', 'Chicago', 'IL', '2024-02-20'),
  ('Dan Wilson', 'dan@example.com', 'Houston', 'TX', '2024-03-10'),
  ('Eve Brown', 'eve@example.com', 'Phoenix', 'AZ', '2024-04-05'),
  ('Frank Lee', 'frank@example.com', 'Seattle', 'WA', '2024-05-12'),
  ('Grace Kim', 'grace@example.com', 'Denver', 'CO', '2024-06-01'),
  ('Hank Miller', 'hank@example.com', 'Boston', 'MA', '2024-07-15');
INSERT INTO products (name, category, price, rating) VALUES
  ('Wireless Mouse', 'Electronics', 29.99, 4.5),
  ('Mechanical Keyboard', 'Electronics', 89.99, 4.7),
  ('USB-C Hub', 'Electronics', 45.00, 4.2),
  ('Standing Desk', 'Furniture', 499.00, 4.8),
  ('Monitor Arm', 'Furniture', 79.99, 4.3),
  ('Notebook Set', 'Office', 12.99, 4.0),
  ('Desk Lamp', 'Office', 34.99, 4.6),
  ('Webcam HD', 'Electronics', 59.99, 4.1);
INSERT INTO orders (customer_id, product_id, quantity, total, status, created_at) VALUES
  (1, 1, 1, 29.99, 'completed', '2024-01-20'),
  (1, 4, 1, 499.00, 'completed', '2024-02-05'),
  (2, 2, 1, 89.99, 'completed', '2024-02-10'),
  (2, 3, 2, 90.00, 'completed', '2024-02-15'),
  (3, 1, 1, 29.99, 'completed', '2024-03-01'),
  (3, 7, 1, 34.99, 'shipped', '2024-03-15'),
  (4, 4, 1, 499.00, 'completed', '2024-04-01'),
  (4, 5, 1, 79.99, 'completed', '2024-04-10'),
  (5, 2, 1, 89.99, 'pending', '2024-05-01'),
  (5, 6, 3, 38.97, 'completed', '2024-05-20'),
  (6, 8, 1, 59.99, 'completed', '2024-06-10'),
  (6, 1, 2, 59.98, 'shipped', '2024-06-25'),
  (7, 3, 1, 45.00, 'completed', '2024-07-01'),
  (7, 7, 2, 69.98, 'completed', '2024-07-15'),
  (8, 4, 1, 499.00, 'pending', '2024-08-01'),
  (1, 8, 1, 59.99, 'completed', '2024-08-15'),
  (2, 5, 1, 79.99, 'completed', '2024-09-01'),
  (3, 2, 1, 89.99, 'shipped', '2024-09-15'),
  (4, 6, 5, 64.95, 'completed', '2024-10-01'),
  (5, 1, 1, 29.99, 'completed', '2024-10-20');
INSERT INTO reviews (product_id, customer_id, rating, body, created_at) VALUES
  (1, 1, 5, 'Great mouse, very comfortable', '2024-01-25'),
  (4, 1, 5, 'Best desk I have ever owned', '2024-02-10'),
  (2, 2, 4, 'Solid keyboard, a bit loud', '2024-02-20'),
  (1, 3, 4, 'Good value for the price', '2024-03-05'),
  (4, 4, 5, 'Excellent build quality', '2024-04-15'),
  (2, 5, 5, 'Perfect for coding', '2024-05-10'),
  (8, 6, 3, 'Decent webcam, nothing special', '2024-06-15'),
  (3, 7, 4, 'Works great with my laptop', '2024-07-10'),
  (7, 3, 5, 'Beautiful lamp, great light', '2024-03-20'),
  (5, 4, 4, 'Sturdy mount, easy to install', '2024-04-20');
