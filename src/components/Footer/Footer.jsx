import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

function Footer() {
  return (
    <footer className="site-footer">
      <p>
        &copy; {new Date().getFullYear()} Keebhub · A Prime Digital Academy
        project · <Link to="/about">About</Link>
      </p>
    </footer>
  );
}

export default Footer;
