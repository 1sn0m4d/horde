<?php
/**
 * The Horde_Block_Collection:: class provides an API to the blocks
 * (applets) framework.
 *
 * Copyright 2003-2010 The Horde Project (http://www.horde.org/)
 *
 * See the enclosed file COPYING for license information (LGPL). If you
 * did not receive this file, see http://www.fsf.org/copyleft/lgpl.html.
 *
 * @author   Mike Cochrane <mike@graftonhall.co.nz>
 * @author   Jan Schneider <jan@horde.org>
 * @category Horde
 * @package  Horde_Block
 */
class Horde_Block_Collection
{
    /**
     * Singleton instances.
     *
     * @var array
     */
    static protected $_instances = array();

    /**
     * Cache for getBlocksList().
     *
     * @var array
     */
    static protected $_blocksCache = array();

    /**
     * What kind of blocks are we collecting? Defaults to any.
     *
     * @var string
     */
    protected $_type = 'portal';

    /**
     * A hash storing the information about all available blocks from
     * all applications.
     *
     * @var array
     */
    protected $_blocks = array();

    /**
     * Returns a single instance of the Horde_Blocks class.
     *
     * @param string $type  The kind of blocks to list.
     * @param array $apps   The applications whose blocks to list.
     *
     * @return Horde_Block_Collection  The Horde_Block_Collection instance.
     */
    static public function singleton($type = null, $apps = array())
    {
        sort($apps);
        $signature = serialize(array($type, $apps));
        if (!isset(self::$_instances[$signature])) {
            self::$_instances[$signature] = new self($type, $apps);
        }

        return self::$_instances[$signature];
    }

    /**
     * Constructor.
     *
     * @param string $type  The kind of blocks to list.
     * @param array $apps   The applications whose blocks to list.
     */
    public function __construct($type = null, $apps = array())
    {
        if (!is_null($type)) {
            $this->_type = $type;
        }

        $signature = serialize($apps);
        if (isset($_SESSION['horde']['blocks'][$signature])) {
            $this->_blocks = &$_SESSION['horde']['blocks'][$signature];
            return;
        }

        foreach ($GLOBALS['registry']->listApps() as $app) {
            if (count($apps) && !in_array($app, $apps)) {
                continue;
            }

            try {
                $pushed = $GLOBALS['registry']->pushApp($app);
            } catch (Horde_Exception $e) {
                continue;
            }

            $blockdir = $GLOBALS['registry']->get('fileroot', $app) . '/lib/Block';
            $dh = @opendir($blockdir);
            if (is_resource($dh)) {
                while (($file = readdir($dh)) !== false) {
                    if (substr($file, -4) == '.php') {
                        $block_name = null;
                        $block_type = null;
                        if (is_readable($blockdir . '/' . $file)) {
                            include_once $blockdir . '/' . $file;
                        }
                        if (!is_null($block_type) && !is_null($this->_type) &&
                            $block_type != $this->_type) {
                            continue;
                        }
                        if (!empty($block_name)) {
                            $this->_blocks[$app][substr($file, 0, -4)]['name'] = $block_name;
                        }
                    }
                }
                closedir($dh);
            }

            // Don't pop an application if we didn't have to push one.
            if ($pushed) {
                $GLOBALS['registry']->popApp($app);
            }
        }

        uksort($this->_blocks, array($this, 'sortBlockCollection'));
        $_SESSION['horde']['blocks'][$signature] = &$this->_blocks;
    }

    /**
     * Block sorting helper
     */
    public function sortBlockCollection($a, $b)
    {
        return strcasecmp($GLOBALS['registry']->get('name', $a), $GLOBALS['registry']->get('name', $b));
    }

    /**
     * TODO
     */
    public function getBlock($app, $name, $params = null, $row = null,
                             $col = null)
    {
        if ($GLOBALS['registry']->get('status', $app) == 'inactive' ||
            ($GLOBALS['registry']->get('status', $app) == 'admin' &&
             !Horde_Auth::isAdmin())) {
            $error = PEAR::raiseError(sprintf(_("%s is not activated."), $GLOBALS['registry']->get('name', $app)));
            return $error;
        }

        $path = $GLOBALS['registry']->get('fileroot', $app) . '/lib/Block/' . $name . '.php';
        if (is_readable($path)) {
            include_once $path;
        }
        $class = 'Horde_Block_' . $app . '_' . $name;
        if (!class_exists($class)) {
            $error = PEAR::raiseError(sprintf(_("%s not found."), $class));
            return $error;
        }

        return new $class($params, $row, $col);
    }

    /**
     * Returns a pretty printed list of all available blocks.
     *
     * @return array  A hash with block IDs as keys and application plus block
     *                block names as values.
     */
    public function getBlocksList()
    {
        if (empty(self::$_blocksCache)) {
            /* Get available blocks from all apps. */
            foreach ($this->_blocks as $app => $app_blocks) {
                foreach ($app_blocks as $block_id => $block) {
                    if (isset($block['name'])) {
                        self::$_blocksCache[$app . ':' . $block_id] = $GLOBALS['registry']->get('name', $app) . ': ' . $block['name'];
                    }
                }
            }
        }

        return self::$_blocksCache;
    }

    /**
     * Returns a layout with all fixed blocks as per configuration.
     *
     * @return string  A default serialized block layout.
     */
    public function getFixedBlocks()
    {
        $layout = array();
        if (isset($GLOBALS['conf']['portal']['fixed_blocks'])) {
            foreach ($GLOBALS['conf']['portal']['fixed_blocks'] as $block) {
                list($app, $type) = explode(':', $block, 2);
                $layout[] = array(array('app' => $app,
                                        'params' => array('type' => $type,
                                                          'params' => false),
                                        'height' => 1,
                                        'width' => 1));
            }
        }

        return $layout;
    }

    /**
     * Returns a select widget with all available blocks.
     *
     * @param string $cur_app    The block from this application gets selected.
     * @param string $cur_block  The block with this name gets selected.
     *
     * @return string  The select tag with all available blocks.
     */
    public function getBlocksWidget($cur_app = null, $cur_block = null,
                                    $onchange = false)
    {
        $widget = '<select name="app"';
        if ($onchange) {
            $widget .= ' onchange="document.blockform.action.value=\'save-resume\';document.blockform.submit()"';
        }
        $widget .= ">\n";

        foreach ($this->getBlocksList() as $id => $name) {
            $widget .= sprintf("<option value=\"%s\"%s>%s</option>\n",
                                   $id,
                                   ($id == $cur_app . ':' . $cur_block) ? ' selected="selected"' : '',
                                   $name);
        }

        return $widget . "</select>\n";
    }

    /**
     * Returns the option type.
     *
     * @param $app TODO
     * @param $block TODO
     * @param $param_id TODO
     *
     * @return TODO
     */
    public function getOptionType($app, $block, $param_id)
    {
        $this->getParams($app, $block);
        return $this->_blocks[$app][$block]['params'][$param_id]['type'];
    }

    /**
     * Returns whether the option is required or not. Defaults to true.
     *
     * @param $app TODO
     * @param $block TODO
     * @param $param_id TODO
     *
     * @return TODO
     */
    public function getOptionRequired($app, $block, $param_id)
    {
        $this->getParams($app, $block);
        return isset($this->_blocks[$app][$block]['params'][$param_id]['required'])
            ? $this->_blocks[$app][$block]['params'][$param_id]['required']
            : true;
    }

    /**
     * Returns the values for an option.
     *
     * @param $app TODO
     * @param $block TODO
     * @param $param_id TODO
     *
     * @return TODO
     */
    public function getOptionValues($app, $block, $param_id)
    {
        $this->getParams($app, $block);
        return $this->_blocks[$app][$block]['params'][$param_id]['values'];
    }

    /**
     * Returns the widget necessary to configure this block.
     *
     * @param $app TODO
     * @param $block TODO
     * @param $param_id TODO
     * @param $val TODO
     *
     * @return TODO
     */
    public function getOptionsWidget($app, $block, $param_id, $val = null)
    {
        $widget = '';

        $this->getParams($app, $block);
        $param = $this->_blocks[$app][$block]['params'][$param_id];
        if (!isset($param['default'])) {
            $param['default'] = '';
        }

        switch ($param['type']) {
        case 'boolean':
        case 'checkbox':
            $checked = !empty($val[$param_id]) ? ' checked="checked"' : '';
            $widget = sprintf('<input type="checkbox" name="params[%s]"%s />', $param_id, $checked);
            break;

        case 'enum':
            $widget = sprintf('<select name="params[%s]">', $param_id);
            foreach ($param['values'] as $key => $name) {
                if (Horde_String::length($name) > 30) {
                    $name = substr($name, 0, 27) . '...';
                }
                $widget .= sprintf("<option value=\"%s\"%s>%s</option>\n",
                                   htmlspecialchars($key),
                                   (isset($val[$param_id]) && $val[$param_id] == $key) ? ' selected="selected"' : '',
                                   htmlspecialchars($name));
            }

            $widget .= '</select>';
            break;

        case 'multienum':
            $widget = sprintf('<select multiple="multiple" name="params[%s][]">', $param_id);
            foreach ($param['values'] as $key => $name) {
                if (Horde_String::length($name) > 30) {
                    $name = substr($name, 0, 27) . '...';
                }
                $widget .= sprintf("<option value=\"%s\"%s>%s</option>\n",
                                   htmlspecialchars($key),
                                   (isset($val[$param_id]) && in_array($key, $val[$param_id])) ? ' selected="selected"' : '',
                                   htmlspecialchars($name));
            }

            $widget .= '</select>';
            break;

        case 'mlenum':
            // Multi-level enum.
            if (is_array($val) && isset($val['__' . $param_id])) {
                $firstval = $val['__' . $param_id];
            } else {
                $tmp = array_keys($param['values']);
                $firstval = current($tmp);
            }
            $blockvalues = $param['values'][$firstval];
            asort($blockvalues);

            $widget = sprintf('<select name="params[__%s]" onchange="document.blockform.action.value=\'save-resume\';document.blockform.submit()">', $param_id) . "\n";
            foreach ($param['values'] as $key => $values) {
                $name = Horde_String::length($key) > 30 ? Horde_String::substr($key, 0, 27) . '...' : $key;
                $widget .= sprintf("<option value=\"%s\"%s>%s</option>\n",
                                   htmlspecialchars($key),
                                   $key == $firstval ? ' selected="selected"' : '',
                                   htmlspecialchars($name));
            }
            $widget .= "</select><br />\n";

            $widget .= sprintf("<select name=\"params[%s]\">\n", $param_id);
            foreach ($blockvalues as $key => $name) {
                $name = (Horde_String::length($name) > 30) ? Horde_String::substr($name, 0, 27) . '...' : $name;
                $widget .= sprintf("<option value=\"%s\"%s>%s</option>\n",
                                   htmlspecialchars($key),
                                   $val[$param_id] == $key ? ' selected="selected"' : '',
                                   htmlspecialchars($name));
            }
            $widget .= "</select><br />\n";
            break;

        case 'int':
        case 'text':
            $widget = sprintf('<input type="text" name="params[%s]" value="%s" />', $param_id, !isset($val[$param_id]) ? $param['default'] : $val[$param_id]);
            break;

        case 'password':
            $widget = sprintf('<input type="password" name="params[%s]" value="%s" />', $param_id, !isset($val[$param_id]) ? $param['default'] : $val[$param_id]);
            break;

        case 'error':
            $widget = '<span class="form-error">' . $param['default'] . '</span>';
            break;
        }

        return $widget;
    }

    /**
     * Returns the name of the specified block.
     *
     * @param string $app    An application name.
     * @param string $block  A block name.
     *
     * @return string  The name of the specified block.
     */
    public function getName($app, $block)
    {
        return isset($this->_blocks[$app][$block])
            ? $this->_blocks[$app][$block]['name']
            : sprintf(_("Block \"%s\" of application \"%s\" not found."), $block, $app);
    }

    /**
     * Returns the parameter list of the specified block.
     *
     * @param string $app    An application name.
     * @param string $block  A block name.
     *
     * @return array  An array with all paramter names.
     */
    public function getParams($app, $block)
    {
        if (!isset($this->_blocks[$app][$block]['params'])) {
            $blockOb = $this->getBlock($app, $block);
            if ($blockOb instanceof PEAR_Error) {
                return $blockOb;
            }
            $this->_blocks[$app][$block]['params'] = $blockOb->getParams();
        }

        if (isset($this->_blocks[$app][$block]['params']) &&
            is_array($this->_blocks[$app][$block]['params'])) {
            return array_keys($this->_blocks[$app][$block]['params']);
        }

        return array();
    }

    /**
     * Returns the (clear text) name of the specified parameter.
     *
     * @param string $app    An application name.
     * @param string $block  A block name.
     * @param string $param  A parameter name.
     *
     * @return string  The name of the specified parameter.
     */
    public function getParamName($app, $block, $param)
    {
        $this->getParams($app, $block);
        return $this->_blocks[$app][$block]['params'][$param]['name'];
    }

    /**
     * Returns the default value of the specified parameter.
     *
     * @param string $app    An application name.
     * @param string $block  A block name.
     * @param string $param  A parameter name.
     *
     * @return string  The default value of the specified parameter or null.
     */
    public function getDefaultValue($app, $block, $param)
    {
        $this->getParams($app, $block);
        return isset($this->_blocks[$app][$block]['params'][$param]['default'])
            ? $this->_blocks[$app][$block]['params'][$param]['default']
            : null;
    }

    /**
     * Returns if the specified block is customizeable by the user.
     *
     * @param string $app    An application name.
     * @param string $block  A block name.
     *
     * @return boolean  True is the block is customizeable.
     */
    public function isEditable($app, $block)
    {
        $this->getParams($app, $block);
        return (isset($this->_blocks[$app][$block]['params']) &&
            count($this->_blocks[$app][$block]['params']));
    }

}
