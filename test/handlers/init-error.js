// Ported from t/test_handlers/init_error.pl, whose body is `0;` so Perl's
// `require` fails with "did not return a true value". The Node analog of a
// module that fails to initialize is one that throws while being imported.
throw new Error('init handler failed to load');
