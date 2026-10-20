import { createTheme } from '@material-ui/core/styles';

// Shared Material-UI theme so buttons, inputs, and cards match the
// rest of the site's purple palette. Colors here are mirrored as CSS
// variables in App.css for plain (non-MUI) elements.
const headingFont = "'Squada One', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const theme = createTheme({
  palette: {
    primary: {
      main: '#5b3f8c',
      dark: '#432c6b',
      light: '#8d6eb8',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#00695c',
      contrastText: '#ffffff',
    },
    error: {
      main: '#b3261e',
    },
    background: {
      default: '#f7f5fb',
      paper: '#ffffff',
    },
    text: {
      primary: '#1f1a2b',
      secondary: '#544b66',
    },
  },
  typography: {
    fontFamily:
      "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    h1: { fontFamily: headingFont },
    h2: { fontFamily: headingFont },
    h3: { fontFamily: headingFont },
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
  props: {
    MuiTextField: {
      variant: 'outlined',
      fullWidth: true,
    },
  },
});

export default theme;
