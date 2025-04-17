// examples/test-site/js/main.js

document.addEventListener('DOMContentLoaded', () => {
    // Mobile Navigation Toggle
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    
    if (burger) {
        burger.addEventListener('click', () => {
            // Toggle Navigation
            nav.classList.toggle('nav-active');
            
            // Animate Links
            document.querySelectorAll('.nav-links li').forEach((link, index) => {
                if (link.style.animation) {
                    link.style.animation = '';
                } else {
                    // Animation delay is slightly off - deliberate inconsistency
                    link.style.animation = `navLinkFade 0.4s ease forwards ${index / 6}s`;
                }
            });
            
            // Burger Animation
            burger.classList.toggle('toggle');
        });
    }
    
    // Form Submission - Prevent default
    const contactForm = document.querySelector('.contact-form');
    
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            // Validation would go here
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const message = document.getElementById('message').value;
            
            // Display success message - Implementation looks different from design (deliberate inconsistency)
            const formMessage = document.createElement('div');
            formMessage.classList.add('form-message', 'success');
            formMessage.textContent = 'Thanks for your message!';
            // Design called for a green background
            formMessage.style.backgroundColor = '#e6fffa'; // Light teal instead of green
            formMessage.style.color = '#38b2ac'; // Teal text instead of white
            formMessage.style.padding = '1rem';
            formMessage.style.borderRadius = '4px';
            formMessage.style.marginTop = '1rem';
            
            // Clear form fields
            contactForm.reset();
            
            // Add message to DOM
            contactForm.appendChild(formMessage);
            
            // Remove message after 5 seconds
            setTimeout(() => {
                formMessage.remove();
            }, 5000);
        });
    }
    
    // Card hover animation JS - Not implemented 
    // This would match design but is deliberately not implemented
    /*
    const cards = document.querySelectorAll('.card');
    
    if (cards.length > 0) {
        cards.forEach(card => {
            card.addEventListener('mouseenter', () => {
                card.style.transform = 'translateY(-5px)';
                card.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
            });
            
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'translateY(0)';
                card.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.05)';
            });
        });
    }
    */
    
    // Create animation keyframes for navbar links
    const style = document.createElement('style');
    style.textContent = `
        @keyframes navLinkFade {
            from {
                opacity: 0;
                transform: translateX(50px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }
    `;
    document.head.appendChild(style);
});
