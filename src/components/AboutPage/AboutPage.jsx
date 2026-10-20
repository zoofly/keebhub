import React from 'react';
import { Card } from '@material-ui/core';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import './AboutPage.css';

const technologies = [
  'React',
  'Node.js',
  'Express',
  'Redux',
  'SweetAlert',
  'Material UI',
  'PostgreSQL',
  'Google Maps API',
];

function AboutPage() {
  useDocumentTitle('About');

  return (
    <div className="page page_narrow">
      <Card className="about-card">
        <h1>About Keebhub</h1>
        <p className="about-card__intro">
          Keebhub is a market for the mechanical keyboard community to make
          trading, buying, and selling between users and vendors easier. No more
          sifting through Reddit posts on r/mechmarket that redirect you to
          unknown vendors!
        </p>

        <h2>Built with</h2>
        <ul className="about-card__tech">
          {technologies.map((tech) => (
            <li key={tech}>{tech}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default AboutPage;
