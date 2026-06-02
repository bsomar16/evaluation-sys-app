-- Create execute_sql RPC function for schema migrations
-- This function allows safe SQL execution for schema changes

CREATE OR REPLACE FUNCTION execute_sql(sql TEXT)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
BEGIN
  EXECUTE sql;
  RETURN QUERY SELECT true, 'SQL executed successfully'::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION execute_sql(TEXT) TO authenticated, anon;
