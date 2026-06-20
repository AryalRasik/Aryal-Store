// 1. Initialize the Supabase Client
const supabaseUrl = 'https://srlejludttajosnrfkca.supabase.co'
const supabaseAnonKey = 'sb_publishable_AHMbtLciU-EznD3ASu0YSQ_sv2PhRoZ'

const supabase = supabase.createClient(supabaseUrl, supabaseAnonKey)

// 2. Fetch products from your Supabase table
async function loadProducts() {
  const { data, error } = await supabase
    .from('products') // Your exact Supabase table name
    .select('*')

  if (error) {
    console.error("Error fetching data from Supabase:", error.message)
    return
  }

  console.log("✅ Successfully connected! Your product details:", data)
  
  // Your code to display 'data' on your webpage goes here
}

// Run the function when the page loads
loadProducts()

// =========================================================
// YOUR ORIGINAL WEBSITE LOGIC (Kept exactly as it was)
// =========================================================
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');
const navLinks = document.querySelectorAll('.nav-link');

hamburger.addEventListener('click', () => {
  navMenu.classList.toggle('active');
  hamburger.classList.toggle('active');
});

navLinks.forEach(link => {
  link.addEventListener('click', () => {
    navMenu.classList.remove('active');
  });
});

const sections = document.querySelectorAll('section[id]');
window.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 100;
    if (scrollY >= sectionTop) {
      current = section.getAttribute('id');
    }
  });
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
});

document.getElementById('contactForm').addEventListener('submit', function(e) {
  e.preventDefault();
  alert('Thank you for reaching out! We will get back to you soon.');
  this.reset();
});

document.querySelector('.newsletter-form').addEventListener('submit', function(e) {
  e.preventDefault();
  alert('Thank you for subscribing to our newsletter!');
  this.reset();
});