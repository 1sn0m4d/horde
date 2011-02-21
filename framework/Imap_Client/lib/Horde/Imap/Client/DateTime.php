<?php
/**
 * Horde_Imap_Client_DateTime:: is a wrapper around PHP's native DateTime
 * class that works around the PHP 5.2.x issue that does not allow DateTime
 * objects to be serialized.  See http://bugs.php.net/bug.php?id=41334
 *
 * Copyright 2009-2011 The Horde Project (http://www.horde.org/)
 *
 * See the enclosed file COPYING for license information (LGPL). If you
 * did not receive this file, see http://www.fsf.org/copyleft/lgpl.html.
 *
 * @author   Michael Slusarz <slusarz@horde.org>
 * @category Horde
 * @license  http://www.fsf.org/copyleft/lgpl.html LGPL
 * @package  Imap_Client
 */
class Horde_Imap_Client_DateTime implements Serializable
{
    /**
     * The DateTime object to use for function calls.
     *
     * @var DateTime
     */
    private $_datetime = null;

    /**
     * Indicate an unparseable time.
     *
     * @var boolean
     */
    private $_error = false;

    /**
     * The datetime string.
     *
     * @var string
     */
    private $_string;

    /**
     * Constructor.
     *
     * @param string $time  String in a format accepted by strtotime().
     */
    public function __construct($time = null)
    {
        $this->_string = is_null($time)
            ? '@0'
            : $time;
    }

    /**
     * String representation: UNIX timestamp.
     */
    public function __toString()
    {
        return $this->format('U');
    }

    /**
     * Serialize.
     *
     * @return string  Serialized representation of this object.
     */
    public function serialize()
    {
        return $this->_string;
    }

    /**
     * Unserialize.
     *
     * @param string $data  Serialized data.
     *
     * @throws Exception
     */
    public function unserialize($data)
    {
        $this->_string = $data;
    }

    /**
     * Was this an unparseable date?
     *
     * @return boolean  True if unparseable.
     */
    public function error()
    {
        $this->_init();

        return $this->_error;
    }

    /**
     * Called on a function call.
     *
     * @throws Exception
     */
    public function __call($name, $arguments)
    {
        $this->_init();

        return call_user_func_array(array($this->_datetime, $name), $arguments);
    }

    /**
     * Init the DateTime object.
     */
    private function _init()
    {
        if (!is_null($this->_datetime)) {
            return;
        }

        $tz = new DateTimeZone('UTC');

        try {
            $this->_datetime = new DateTime($this->_string, $tz);
        } catch (Exception $e) {
            /* Bug #5717 - Check for UT vs. UTC. */
            if (substr(rtrim($date), -3) == ' UT') {
                try {
                    $this->_datetime = new DateTime($this->_string . 'C', $tz);
                } catch (Exception $e) {}
            }
        }

        if (is_null($this->_datetime)) {
            $this->_datetime = new DateTime('@0', $tz);
            $this->_error = true;
        }
    }

}
